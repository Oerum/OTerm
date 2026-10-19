use crate::ssh_client::{connect_and_auth, ConnectRequest, SshHandle};
use crate::terminal::output::{Attachment, SessionOutput};
use russh::ChannelMsg;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::AppHandle;
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
    output: Arc<SessionOutput>,
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
        let output = SessionOutput::for_app(app.clone(), session_id.clone());

        let session = Arc::new(SshTerminalSession {
            write_half: Mutex::new(write_half),
            _handle: handle,
            output,
        });

        self.sessions
            .lock()
            .await
            .insert(session_id.clone(), Arc::clone(&session));

        spawn_reader(read_half, Arc::clone(&session));

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

    pub async fn attach_output(&self, session_id: &str) -> Result<Attachment, String> {
        self.session(session_id).await?.output.attach()
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
            guard
                .drain()
                .map(|(_, session)| session)
                .collect::<Vec<_>>()
        };
        for session in sessions {
            Self::teardown_session(session).await;
        }
    }

    async fn teardown_session(session: Arc<SshTerminalSession>) {
        session.output.cancel();
        let write_half = session.write_half.lock().await;
        let _ = write_half.close().await;
    }
}

fn spawn_reader(mut read_half: russh::ChannelReadHalf, session: Arc<SshTerminalSession>) {
    tauri::async_runtime::spawn(async move {
        run_reader(&session.output, &mut read_half).await;
    });
}

async fn wait_deadline(output: &SessionOutput) {
    match output.status_deadline() {
        Some(deadline) => tokio::time::sleep_until(tokio::time::Instant::from_std(deadline)).await,
        None => std::future::pending().await,
    }
}

trait ChannelReader {
    fn next(&mut self) -> impl std::future::Future<Output = Option<ChannelMsg>> + Send;
}

impl ChannelReader for russh::ChannelReadHalf {
    async fn next(&mut self) -> Option<ChannelMsg> {
        self.wait().await
    }
}

async fn run_reader(output: &SessionOutput, reader: &mut impl ChannelReader) {
    loop {
        let msg = tokio::select! {
            _ = output.wait_stopped() => break,
            _ = wait_deadline(output) => { output.finish(); break; },
            msg = async {
                if output.wait_until_readable_async().await { reader.next().await } else { None }
            } => msg,
        };
        match msg {
            Some(ChannelMsg::Data { data }) => output.push(0, &data),
            Some(ChannelMsg::ExtendedData { data, .. }) => output.push(1, &data),
            Some(ChannelMsg::ExitStatus { exit_status }) => {
                output.record_status(exit_status as i32)
            }
            Some(ChannelMsg::Eof) => output.record_eof(),
            Some(ChannelMsg::Close) | None => {
                output.finish();
                break;
            }
            _ => {}
        }
        if output.ready_to_finish() {
            output.finish();
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::terminal::output::OutputSink;
    use std::sync::Mutex as StdMutex;
    use std::time::Duration;
    #[derive(Default)]
    struct Sink(StdMutex<Vec<String>>);
    impl OutputSink for Sink {
        fn output(&self, data: &str) -> Result<(), String> {
            self.0.lock().unwrap().push(format!("out:{data}"));
            Ok(())
        }
        fn exit(&self, code: Option<i32>) -> Result<(), String> {
            self.0.lock().unwrap().push(format!("exit:{code:?}"));
            Ok(())
        }
    }
    struct Messages {
        messages: std::collections::VecDeque<ChannelMsg>,
        stay_open: bool,
    }
    impl ChannelReader for Messages {
        async fn next(&mut self) -> Option<ChannelMsg> {
            if let Some(msg) = self.messages.pop_front() {
                return Some(msg);
            }
            if self.stay_open {
                std::future::pending().await
            } else {
                None
            }
        }
    }
    #[tokio::test]
    async fn eof_before_exit_status_is_a_half_close() {
        let sink = Arc::new(Sink::default());
        let output = SessionOutput::new(sink.clone());
        output.attach().unwrap();
        let mut messages = Messages {
            messages: std::collections::VecDeque::from([
                ChannelMsg::Data {
                    data: b"last".to_vec().into(),
                },
                ChannelMsg::Eof,
                ChannelMsg::ExitStatus { exit_status: 9 },
            ]),
            stay_open: false,
        };
        run_reader(&output, &mut messages).await;
        assert_eq!(*sink.0.lock().unwrap(), ["out:last", "exit:Some(9)"]);
    }
    #[tokio::test]
    async fn status_drains_later_data_and_open_channel_has_a_bounded_exit() {
        let sink = Arc::new(Sink::default());
        let output = SessionOutput::new(sink.clone());
        output.attach().unwrap();
        let mut messages = Messages {
            messages: std::collections::VecDeque::from([
                ChannelMsg::ExitStatus { exit_status: 3 },
                ChannelMsg::Data {
                    data: b"after status".to_vec().into(),
                },
            ]),
            stay_open: true,
        };
        tokio::time::timeout(Duration::from_secs(2), run_reader(&output, &mut messages))
            .await
            .unwrap();
        assert_eq!(
            *sink.0.lock().unwrap(),
            ["out:after status", "exit:Some(3)"]
        );
    }
    #[tokio::test]
    async fn kill_wakes_a_blocked_remote_reader() {
        let output = SessionOutput::new(Arc::new(Sink::default()));
        let reader = output.clone();
        let task = tokio::spawn(async move {
            run_reader(
                &reader,
                &mut Messages {
                    messages: std::collections::VecDeque::new(),
                    stay_open: true,
                },
            )
            .await;
        });
        tokio::task::yield_now().await;
        output.cancel();
        tokio::time::timeout(Duration::from_secs(1), task)
            .await
            .unwrap()
            .unwrap();
    }
}
