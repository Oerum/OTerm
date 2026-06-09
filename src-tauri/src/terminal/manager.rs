use crate::terminal::agent_process::detect_agent_in_tree;
use crate::terminal::profiles::{resolve_shell, ShellProfile};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

pub struct PtyManager {
    sessions: Mutex<HashMap<String, PtySession>>,
}

struct PtySession {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    pending_output: Arc<Mutex<String>>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
    agent_poll_cancel: Arc<AtomicBool>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutputEvent {
    session_id: String,
    data: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalExitEvent {
    session_id: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalAgentChangedEvent {
    session_id: String,
    agent_id: Option<String>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn list_shells(&self) -> Vec<ShellProfile> {
        crate::terminal::profiles::available_shells()
    }

    pub fn spawn(
        &self,
        app: AppHandle,
        shell_id: String,
        cols: u16,
        rows: u16,
        cwd: Option<String>,
    ) -> Result<String, String> {
        let profile = resolve_shell(&shell_id).ok_or_else(|| format!("Unknown shell: {shell_id}"))?;
        let session_id = Uuid::new_v4().to_string();
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|err| err.to_string())?;

        let mut cmd = CommandBuilder::new(&profile.program);
        for arg in &profile.args {
            cmd.arg(arg);
        }

        if let Some(dir) = cwd.or(default_cwd()) {
            cmd.cwd(dir);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|err| err.to_string())?;
        let root_pid = child
            .process_id()
            .ok_or_else(|| "Failed to get shell process id".to_string())?;
        let writer = pair.master.take_writer().map_err(|err| err.to_string())?;
        let reader = pair.master.try_clone_reader().map_err(|err| err.to_string())?;
        let master: Box<dyn MasterPty + Send> = pair.master;

        let pending_output = Arc::new(Mutex::new(String::new()));
        let agent_poll_cancel = Arc::new(AtomicBool::new(false));
        let session = PtySession {
            master: Mutex::new(master),
            writer: Mutex::new(writer),
            pending_output: Arc::clone(&pending_output),
            _child: child,
            agent_poll_cancel: Arc::clone(&agent_poll_cancel),
        };

        self.sessions
            .lock()
            .map_err(|_| "Session lock poisoned".to_string())?
            .insert(session_id.clone(), session);

        spawn_reader(app.clone(), session_id.clone(), reader, pending_output);
        spawn_agent_poller(app, session_id.clone(), root_pid, agent_poll_cancel);
        Ok(session_id)
    }

    pub fn drain_output(&self, session_id: &str) -> Result<String, String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "Session lock poisoned".to_string())?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Unknown session: {session_id}"))?;
        let mut pending = session
            .pending_output
            .lock()
            .map_err(|_| "Output lock poisoned".to_string())?;
        if pending.is_empty() {
            return Ok(String::new());
        }
        let drained = std::mem::take(&mut *pending);
        Ok(drained)
    }

    pub fn write(&self, session_id: &str, data: &str) -> Result<(), String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "Session lock poisoned".to_string())?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Unknown session: {session_id}"))?;
        let mut writer = session
            .writer
            .lock()
            .map_err(|_| "Writer lock poisoned".to_string())?;
        writer
            .write_all(data.as_bytes())
            .map_err(|err| err.to_string())?;
        writer.flush().map_err(|err| err.to_string())
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "Session lock poisoned".to_string())?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Unknown session: {session_id}"))?;
        let resize_result = {
            let master = session
                .master
                .lock()
                .map_err(|_| "Master lock poisoned".to_string())?;
            master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|err| err.to_string())
        };
        resize_result
    }

    pub fn kill(&self, session_id: &str) -> Result<(), String> {
        let session = self
            .sessions
            .lock()
            .map_err(|_| "Session lock poisoned".to_string())?
            .remove(session_id)
            .ok_or_else(|| format!("Unknown session: {session_id}"))?;
        session
            .agent_poll_cancel
            .store(true, Ordering::Relaxed);
        Ok(())
    }
}

fn default_cwd() -> Option<String> {
    std::env::var("USERPROFILE")
        .ok()
        .or_else(|| std::env::var("HOME").ok())
}

fn emit_output(app: &AppHandle, session_id: &str, data: String) {
    let payload = TerminalOutputEvent {
        session_id: session_id.to_string(),
        data,
    };
    let _ = app.emit("terminal-output", payload);
}

fn spawn_agent_poller(
    app: AppHandle,
    session_id: String,
    root_pid: u32,
    cancel: Arc<AtomicBool>,
) {
    thread::spawn(move || {
        let mut last: Option<String> = None;
        while !cancel.load(Ordering::Relaxed) {
            let current = detect_agent_in_tree(root_pid);
            if current != last {
                let payload = TerminalAgentChangedEvent {
                    session_id: session_id.clone(),
                    agent_id: current.clone(),
                };
                let _ = app.emit("terminal-agent-changed", payload);
                last = current;
            }
            thread::sleep(Duration::from_millis(1500));
        }
    });
}

fn spawn_reader(
    app: AppHandle,
    session_id: String,
    mut reader: Box<dyn Read + Send>,
    pending_output: Arc<Mutex<String>>,
) {
    thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let data = String::from_utf8_lossy(&buffer[..count]).into_owned();
                    if let Ok(mut pending) = pending_output.lock() {
                        pending.push_str(&data);
                    }
                    emit_output(&app, &session_id, data);
                }
                Err(err) if err.kind() == ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(20));
                }
                Err(err) if err.kind() == ErrorKind::Interrupted => {}
                Err(_) => {
                    // On Windows the PTY signals EOF via a broken-pipe error
                    // rather than Ok(0). Treat any unrecognised error as the
                    // child having exited so we emit terminal-exit correctly.
                    break;
                }
            }
        }
        let payload = TerminalExitEvent {
            session_id: session_id.clone(),
        };
        let _ = app.emit("terminal-exit", payload);
    });
}
