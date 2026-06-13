use crate::ssh_client::{connect_and_auth, ConnectRequest, SshHandle};
use russh::ChannelMsg;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use uuid::Uuid;

pub struct SshTerminalManager {
    sessions: Mutex<HashMap<String, Arc<SshTerminalSession>>>,
}

type ShellWriteHalf = russh::ChannelWriteHalf<russh::client::Msg>;

struct SshTerminalSession {
    write_half: Mutex<ShellWriteHalf>,
    _handle: SshHandle,
    exit_emitted: AtomicBool,
    read_cancel: AtomicBool,
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

impl SshTerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub async fn spawn(
        &self,
        app: AppHandle,
        request: ConnectRequest,
        cols: u16,
        rows: u16,
        _startup_snippet: Option<String>,
    ) -> Result<String, String> {
        let handle = connect_and_auth(&request).await?;
        let channel = handle
            .channel_open_session()
            .await
            .map_err(|err| format!("Could not open SSH session: {err}"))?;

        channel
            .request_pty(false, "xterm-256color", cols as u32, rows as u32, 0, 0, &[])
            .await
            .map_err(|err| format!("PTY request failed: {err}"))?;

        channel
            .request_shell(true)
            .await
            .map_err(|err| format!("Shell request failed: {err}"))?;

        let (read_half, write_half) = channel.split();
        let session_id = Uuid::new_v4().to_string();
        let exit_emitted = AtomicBool::new(false);
        let read_cancel = AtomicBool::new(false);

        let session = Arc::new(SshTerminalSession {
            write_half: Mutex::new(write_half),
            _handle: handle,
            exit_emitted,
            read_cancel,
        });

        self.sessions
            .lock()
            .await
            .insert(session_id.clone(), Arc::clone(&session));

        spawn_reader(app, session_id.clone(), read_half, Arc::clone(&session));

        Ok(session_id)
    }

    async fn session(&self, session_id: &str) -> Result<Arc<SshTerminalSession>, String> {
        self.sessions
            .lock()
            .await
            .get(session_id)
            .cloned()
            .ok_or_else(|| format!("Unknown session: {session_id}"))
    }

    pub async fn write(&self, session_id: &str, data: &str) -> Result<(), String> {
        let session = self.session(session_id).await?;
        let write_half = session.write_half.lock().await;
        let mut writer = write_half.make_writer();
        writer
            .write_all(data.as_bytes())
            .await
            .map_err(|err| err.to_string())?;
        writer.flush().await.map_err(|err| err.to_string())
    }

    pub async fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let session = self.session(session_id).await?;
        let write_half = session.write_half.lock().await;
        write_half
            .window_change(cols as u32, rows as u32, 0, 0)
            .await
            .map_err(|err| err.to_string())
    }

    pub async fn kill(&self, session_id: &str) -> Result<(), String> {
        let session = self
            .sessions
            .lock()
            .await
            .remove(session_id)
            .ok_or_else(|| format!("Unknown session: {session_id}"))?;
        Self::teardown_session(session).await;
        Ok(())
    }

    pub async fn kill_all(&self) {
        let sessions = {
            let mut guard = self.sessions.lock().await;
            guard.drain().map(|(_, session)| session).collect::<Vec<_>>()
        };
        for session in sessions {
            Self::teardown_session(session).await;
        }
    }

    async fn teardown_session(session: Arc<SshTerminalSession>) {
        session.read_cancel.store(true, Ordering::Relaxed);
        session.exit_emitted.store(true, Ordering::Relaxed);
        let write_half = session.write_half.lock().await;
        let _ = write_half.close().await;
    }
}

fn spawn_reader(
    app: AppHandle,
    session_id: String,
    mut read_half: russh::ChannelReadHalf,
    session: Arc<SshTerminalSession>,
) {
    tauri::async_runtime::spawn(async move {
        loop {
            if session.read_cancel.load(Ordering::Relaxed) {
                break;
            }

            let msg = read_half.wait().await;

            match msg {
                Some(ChannelMsg::Data { data }) => {
                    let text = String::from_utf8_lossy(&data).to_string();
                    emit_output(&app, &session_id, text);
                }
                Some(ChannelMsg::ExtendedData { data, .. }) => {
                    let text = String::from_utf8_lossy(&data).to_string();
                    emit_output(&app, &session_id, text);
                }
                Some(ChannelMsg::ExitStatus { exit_status }) => {
                    emit_exit(&app, &session_id, Some(exit_status as i32), &session);
                    break;
                }
                Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                    emit_exit(&app, &session_id, None, &session);
                    break;
                }
                _ => {}
            }
        }
    });
}

fn emit_output(app: &AppHandle, session_id: &str, data: String) {
    let payload = TerminalOutputEvent {
        session_id: session_id.to_string(),
        data,
    };
    let _ = app.emit("terminal-output", payload);
}

fn emit_exit(
    app: &AppHandle,
    session_id: &str,
    exit_code: Option<i32>,
    session: &SshTerminalSession,
) {
    if session.exit_emitted.swap(true, Ordering::Relaxed) {
        return;
    }
    let payload = TerminalExitEvent {
        session_id: session_id.to_string(),
        exit_code,
    };
    let _ = app.emit("terminal-exit", payload);
}
