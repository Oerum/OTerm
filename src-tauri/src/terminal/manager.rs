use crate::terminal::agent_process::{detect_active_process, detect_agent_in_tree};
use crate::terminal::profiles::{resolve_shell, ShellProfile};
use crate::terminal::shell_integration::prepare_shell_launch;
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
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    root_pid: u32,
    agent_poll_cancel: Arc<AtomicBool>,
    exit_watch_cancel: Arc<AtomicBool>,
    exit_emitted: Arc<AtomicBool>,
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
    exit_code: Option<i32>,
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
        if cols < 2 || rows < 2 {
            return Err(format!("PTY size too small: {cols}x{rows} (minimum 2x2)"));
        }
        let profile =
            resolve_shell(&shell_id).ok_or_else(|| format!("Unknown shell: {shell_id}"))?;
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

        let launch_plan = prepare_shell_launch(&shell_id).unwrap_or_else(|err| {
            eprintln!("shell integration unavailable for {shell_id}: {err}");
            crate::terminal::shell_integration::ShellLaunchPlan {
                extra_args: Vec::new(),
                env: vec![("OTERM_SHELL_INTEGRATION".into(), "0".into())],
            }
        });

        let mut cmd = CommandBuilder::new(&profile.program);
        for arg in &profile.args {
            cmd.arg(arg);
        }
        for arg in &launch_plan.extra_args {
            cmd.arg(arg);
        }
        for (key, value) in &launch_plan.env {
            cmd.env(key, value);
        }

        if let Some(dir) = cwd.or(default_cwd()) {
            cmd.cwd(dir);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|err| err.to_string())?;
        // Release the slave handle so ConPTY can signal EOF on the master when the
        // shell exits (required on Windows; see portable-pty whoami example).
        drop(pair.slave);

        let root_pid = child
            .process_id()
            .ok_or_else(|| "Failed to get shell process id".to_string())?;
        let writer = pair.master.take_writer().map_err(|err| err.to_string())?;
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|err| err.to_string())?;
        let master: Box<dyn MasterPty + Send> = pair.master;

        let pending_output = Arc::new(Mutex::new(String::new()));
        let agent_poll_cancel = Arc::new(AtomicBool::new(false));
        let exit_watch_cancel = Arc::new(AtomicBool::new(false));
        let exit_emitted = Arc::new(AtomicBool::new(false));
        let child = Arc::new(Mutex::new(child));

        let session = PtySession {
            master: Mutex::new(master),
            writer: Mutex::new(writer),
            pending_output: Arc::clone(&pending_output),
            child: Arc::clone(&child),
            root_pid,
            agent_poll_cancel: Arc::clone(&agent_poll_cancel),
            exit_watch_cancel: Arc::clone(&exit_watch_cancel),
            exit_emitted: Arc::clone(&exit_emitted),
        };

        self.sessions
            .lock()
            .map_err(|_| "Session lock poisoned".to_string())?
            .insert(session_id.clone(), session);

        spawn_reader(app.clone(), session_id.clone(), reader, pending_output);
        spawn_child_exit_watcher(
            app.clone(),
            session_id.clone(),
            child,
            exit_watch_cancel,
            exit_emitted,
        );
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

    pub fn query_active_agent(&self, session_id: &str) -> Result<Option<String>, String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "Session lock poisoned".to_string())?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Unknown session: {session_id}"))?;
        let mut system = sysinfo::System::new();
        Ok(detect_agent_in_tree(&mut system, session.root_pid))
    }

    pub fn kill(&self, session_id: &str) -> Result<(), String> {
        let session = self
            .sessions
            .lock()
            .map_err(|_| "Session lock poisoned".to_string())?
            .remove(session_id)
            .ok_or_else(|| format!("Unknown session: {session_id}"))?;
        Self::teardown_session(session);
        Ok(())
    }

    pub fn kill_all(&self) {
        let sessions = match self.sessions.lock() {
            Ok(mut guard) => guard
                .drain()
                .map(|(_, session)| session)
                .collect::<Vec<_>>(),
            Err(_) => return,
        };
        for session in sessions {
            Self::teardown_session(session);
        }
    }

    fn teardown_session(session: PtySession) {
        session.agent_poll_cancel.store(true, Ordering::Relaxed);
        session.exit_watch_cancel.store(true, Ordering::Relaxed);
        session.exit_emitted.store(true, Ordering::Relaxed);
        if let Ok(mut child) = session.child.lock() {
            let _ = child.kill();
        }
        // Drop PTY handles promptly so ConPTY/OpenConsole teardown is not delayed.
        drop(session.master);
        drop(session.writer);
        drop(session.child);
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

fn emit_terminal_exit(
    app: &AppHandle,
    session_id: &str,
    exit_code: Option<i32>,
    exit_emitted: &Arc<AtomicBool>,
) {
    if exit_emitted.swap(true, Ordering::Relaxed) {
        return;
    }
    let payload = TerminalExitEvent {
        session_id: session_id.to_string(),
        exit_code,
    };
    let _ = app.emit("terminal-exit", payload);
}

fn spawn_child_exit_watcher(
    app: AppHandle,
    session_id: String,
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    cancel: Arc<AtomicBool>,
    exit_emitted: Arc<AtomicBool>,
) {
    thread::spawn(move || {
        let mut exit_code: Option<i32> = None;
        while !cancel.load(Ordering::Relaxed) {
            let status = child
                .lock()
                .ok()
                .and_then(|mut c| c.try_wait().ok().flatten());
            if let Some(status) = status {
                exit_code = Some(status.exit_code() as i32);
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }
        if !cancel.load(Ordering::Relaxed) {
            emit_terminal_exit(&app, &session_id, exit_code, &exit_emitted);
        }
    });
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalProcessChangedEvent {
    session_id: String,
    process_name: Option<String>,
    command: Option<String>,
}

fn spawn_agent_poller(app: AppHandle, session_id: String, root_pid: u32, cancel: Arc<AtomicBool>) {
    thread::spawn(move || {
        let mut system = sysinfo::System::new();
        let root = sysinfo::Pid::from_u32(root_pid);
        let mut last_agent: Option<String> = None;
        let mut last_proc_name: Option<String> = None;
        let mut last_proc_cmd: Option<String> = None;
        while !cancel.load(Ordering::Relaxed) {
            let current_agent = detect_agent_in_tree(&mut system, root_pid);
            if system.process(root).is_none() {
                break;
            }
            if current_agent != last_agent {
                let payload = TerminalAgentChangedEvent {
                    session_id: session_id.clone(),
                    agent_id: current_agent.clone(),
                };
                let _ = app.emit("terminal-agent-changed", payload);
                last_agent = current_agent;
            }

            let current_proc = detect_active_process(&system, root_pid);
            let (proc_name, proc_cmd) = match current_proc {
                Some(p) => (Some(p.name), Some(p.command)),
                None => (None, None),
            };

            if proc_name != last_proc_name || proc_cmd != last_proc_cmd {
                let payload = TerminalProcessChangedEvent {
                    session_id: session_id.clone(),
                    process_name: proc_name.clone(),
                    command: proc_cmd.clone(),
                };
                let _ = app.emit("terminal-process-changed", payload);
                last_proc_name = proc_name;
                last_proc_cmd = proc_cmd;
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
                    // rather than Ok(0). Exit is emitted by spawn_child_exit_watcher
                    // so we can include the real exit code.
                    break;
                }
            }
        }
    });
}
