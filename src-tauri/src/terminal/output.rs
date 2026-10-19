//! Per-session startup replay, UTF-8 decoding and final-output ordering.

use std::collections::VecDeque;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::Notify;

pub const STARTUP_BUDGET: usize = 64 * 1024;
pub const EXIT_DRAIN_GRACE: Duration = Duration::from_millis(500);

pub trait OutputSink: Send + Sync {
    fn output(&self, data: &str) -> Result<(), String>;
    fn exit(&self, exit_code: Option<i32>) -> Result<(), String>;
}

struct AppOutputSink {
    app: AppHandle,
    session_id: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputEvent<'a> {
    session_id: &'a str,
    data: &'a str,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ExitEvent<'a> {
    session_id: &'a str,
    exit_code: Option<i32>,
}

impl OutputSink for AppOutputSink {
    fn output(&self, data: &str) -> Result<(), String> {
        self.app
            .emit(
                "terminal-output",
                OutputEvent {
                    session_id: &self.session_id,
                    data,
                },
            )
            .map_err(|err| err.to_string())
    }

    fn exit(&self, exit_code: Option<i32>) -> Result<(), String> {
        self.app
            .emit(
                "terminal-exit",
                ExitEvent {
                    session_id: &self.session_id,
                    exit_code,
                },
            )
            .map_err(|err| err.to_string())
    }
}

#[derive(Default)]
struct Utf8Decoder {
    carry: Vec<u8>,
}

impl Utf8Decoder {
    fn decode(&mut self, bytes: &[u8], eof: bool) -> String {
        self.carry.extend_from_slice(bytes);
        let mut text = String::new();
        let mut offset = 0;
        while offset < self.carry.len() {
            match std::str::from_utf8(&self.carry[offset..]) {
                Ok(valid) => {
                    text.push_str(valid);
                    offset = self.carry.len();
                }
                Err(err) => {
                    let end = offset + err.valid_up_to();
                    text.push_str(std::str::from_utf8(&self.carry[offset..end]).unwrap());
                    offset = end;
                    match err.error_len() {
                        Some(length) => {
                            text.push('\u{fffd}');
                            offset += length;
                        }
                        None if eof => {
                            text.push('\u{fffd}');
                            offset = self.carry.len();
                        }
                        None => break,
                    }
                }
            }
        }
        self.carry.drain(..offset);
        text
    }
}

#[derive(Default)]
struct DeliveryState {
    attached: bool,
    cancelled: bool,
    completed: bool,
    exit_emitted: bool,
    exit_code: Option<i32>,
    status_at: Option<Instant>,
    eof: bool,
    pending: VecDeque<String>,
    pending_bytes: usize,
    decoders: [Utf8Decoder; 2],
}

#[derive(Debug, serde::Serialize, PartialEq)]
pub struct Attachment {
    pub ended: bool,
}

pub struct SessionOutput {
    state: Mutex<DeliveryState>,
    readable: Condvar,
    changed: Notify,
    sink: Arc<dyn OutputSink>,
}

impl SessionOutput {
    pub fn for_app(app: AppHandle, session_id: String) -> Arc<Self> {
        Self::new(Arc::new(AppOutputSink { app, session_id }))
    }

    pub fn new(sink: Arc<dyn OutputSink>) -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(DeliveryState::default()),
            readable: Condvar::new(),
            changed: Notify::new(),
            sink,
        })
    }

    fn wake(&self) {
        self.readable.notify_all();
        self.changed.notify_waiters();
    }

    fn publish(&self, state: &mut DeliveryState) -> Result<(), String> {
        while let Some(data) = state.pending.front() {
            self.sink.output(data)?;
            state.pending_bytes -= data.len();
            state.pending.pop_front();
        }
        if state.completed && !state.exit_emitted {
            self.sink.exit(state.exit_code)?;
            state.exit_emitted = true;
        }
        Ok(())
    }

    pub fn attach(&self) -> Result<Attachment, String> {
        let mut state = self.state.lock().map_err(|_| "Output lock poisoned")?;
        if state.cancelled {
            return Err("Session cancelled".into());
        }
        self.publish(&mut state)?;
        state.attached = true;
        let result = Attachment {
            ended: state.completed || state.status_at.is_some(),
        };
        drop(state);
        self.wake();
        Ok(result)
    }

    pub fn wait_until_readable(&self) -> bool {
        let mut state = self.state.lock().unwrap();
        while !state.cancelled && !state.completed && state.pending_bytes >= STARTUP_BUDGET {
            state = self.readable.wait(state).unwrap();
        }
        !state.cancelled && !state.completed
    }

    pub async fn wait_until_readable_async(&self) -> bool {
        loop {
            let changed = self.changed.notified();
            tokio::pin!(changed);
            changed.as_mut().enable();
            {
                let state = self.state.lock().unwrap();
                if state.cancelled || state.completed {
                    return false;
                }
                if state.pending_bytes < STARTUP_BUDGET {
                    return true;
                }
            }
            changed.await;
        }
    }

    pub async fn wait_stopped(&self) {
        loop {
            let changed = self.changed.notified();
            tokio::pin!(changed);
            changed.as_mut().enable();
            if self.stopped() {
                return;
            }
            changed.await;
        }
    }

    pub fn stopped(&self) -> bool {
        let state = self.state.lock().unwrap();
        state.cancelled || state.completed
    }

    pub fn push(&self, stream: usize, bytes: &[u8]) {
        let mut state = self.state.lock().unwrap();
        if state.cancelled || state.completed {
            return;
        }
        let data = state.decoders[stream].decode(bytes, false);
        Self::retain(&mut state, data);
        if state.attached {
            let _ = self.publish(&mut state);
        }
    }

    fn retain(state: &mut DeliveryState, data: String) {
        if !data.is_empty() {
            state.pending_bytes += data.len();
            state.pending.push_back(data);
        }
    }

    pub fn record_status(&self, exit_code: i32) {
        let mut state = self.state.lock().unwrap();
        state.exit_code = Some(exit_code);
        state.status_at.get_or_insert_with(Instant::now);
    }

    pub fn record_eof(&self) {
        self.state.lock().unwrap().eof = true;
    }

    pub fn status_deadline(&self) -> Option<Instant> {
        self.state
            .lock()
            .unwrap()
            .status_at
            .map(|at| at + EXIT_DRAIN_GRACE)
    }

    pub fn ready_to_finish(&self) -> bool {
        let state = self.state.lock().unwrap();
        state
            .status_at
            .is_some_and(|at| state.eof || at.elapsed() >= EXIT_DRAIN_GRACE)
    }

    pub fn finish(&self) {
        let mut state = self.state.lock().unwrap();
        if state.cancelled || state.completed {
            return;
        }
        for stream in 0..state.decoders.len() {
            let tail = state.decoders[stream].decode(&[], true);
            Self::retain(&mut state, tail);
        }
        state.completed = true;
        if state.attached {
            let _ = self.publish(&mut state);
        }
        drop(state);
        self.wake();
    }

    pub fn cancel(&self) {
        let mut state = self.state.lock().unwrap();
        state.cancelled = true;
        state.pending.clear();
        state.pending_bytes = 0;
        drop(state);
        self.wake();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    #[derive(Default)]
    struct Sink {
        events: Mutex<Vec<String>>,
        fail: AtomicBool,
    }
    impl OutputSink for Sink {
        fn output(&self, data: &str) -> Result<(), String> {
            if self.fail.load(Ordering::Relaxed) {
                return Err("emit failed".into());
            }
            self.events.lock().unwrap().push(format!("out:{data}"));
            Ok(())
        }
        fn exit(&self, code: Option<i32>) -> Result<(), String> {
            self.events.lock().unwrap().push(format!("exit:{code:?}"));
            Ok(())
        }
    }

    #[test]
    fn startup_replay_is_once_and_finishes_after_output() {
        let sink = Arc::new(Sink::default());
        let output = SessionOutput::new(sink.clone());
        output.push(0, b"startup");
        output.record_status(7);
        output.finish();
        assert!(sink.events.lock().unwrap().is_empty());
        assert_eq!(output.attach().unwrap(), Attachment { ended: true });
        output.attach().unwrap();
        output.push(0, b"too late");
        output.finish();
        assert_eq!(
            *sink.events.lock().unwrap(),
            ["out:startup", "exit:Some(7)"]
        );
        assert_eq!(output.state.lock().unwrap().pending_bytes, 0);
    }

    #[test]
    fn attachment_during_root_exit_drain_blocks_launch_input_but_preserves_final_output() {
        let sink = Arc::new(Sink::default());
        let output = SessionOutput::new(sink.clone());
        output.record_status(4);
        assert_eq!(output.attach().unwrap(), Attachment { ended: true });
        assert!(!output.stopped());
        output.push(0, b"final drain");
        output.record_eof();
        assert!(output.ready_to_finish());
        output.finish();
        assert_eq!(
            *sink.events.lock().unwrap(),
            ["out:final drain", "exit:Some(4)"]
        );
    }

    #[test]
    fn failed_attachment_retains_unsent_output() {
        let sink = Arc::new(Sink::default());
        let output = SessionOutput::new(sink.clone());
        output.push(0, b"saved");
        sink.fail.store(true, Ordering::Relaxed);
        assert!(output.attach().is_err());
        assert!(!output.state.lock().unwrap().attached);
        sink.fail.store(false, Ordering::Relaxed);
        output.attach().unwrap();
        output.push(0, b"live");
        assert_eq!(*sink.events.lock().unwrap(), ["out:saved", "out:live"]);
        assert_eq!(output.state.lock().unwrap().pending_bytes, 0);
    }

    #[test]
    fn utf8_carry_is_separate_and_flushes_only_at_completion() {
        let sink = Arc::new(Sink::default());
        let output = SessionOutput::new(sink.clone());
        output.attach().unwrap();
        output.push(0, &[0xf0, 0x9f]);
        output.push(1, b"err");
        output.push(0, &[0x98, 0x80]);
        output.push(1, &[0xff, 0xe2]);
        output.finish();
        assert_eq!(
            *sink.events.lock().unwrap(),
            ["out:err", "out:😀", "out:�", "out:�", "exit:None"]
        );
    }

    #[test]
    fn every_utf8_split_preserves_ansi_osc_and_matches_lossy_eof_for_malformed_bytes() {
        for bytes in [
            "ASCII ¢ € 😀\u{1b}[31mred\u{1b}[0m\u{1b}]0;title\u{7}".as_bytes(),
            &[b'a', 0xf0, 0x9f, b'(', 0xff, 0xe2, 0x82],
        ] {
            for split in 0..=bytes.len() {
                let mut decoder = Utf8Decoder::default();
                let mut decoded = decoder.decode(&bytes[..split], false);
                assert!(decoder.carry.len() <= 3);
                decoded.push_str(&decoder.decode(&bytes[split..], false));
                decoded.push_str(&decoder.decode(&[], true));
                assert_eq!(decoded, String::from_utf8_lossy(bytes), "split {split}");
                assert!(decoder.carry.is_empty());
            }
        }
    }

    #[test]
    fn backpressure_wakes_on_attach_or_cancel_and_never_attached_disposal() {
        for attach in [true, false] {
            let output = SessionOutput::new(Arc::new(Sink::default()));
            output.push(0, &vec![b'x'; STARTUP_BUDGET]);
            let (tx, rx) = std::sync::mpsc::channel();
            let reader = output.clone();
            let handle = std::thread::spawn(move || {
                tx.send(reader.wait_until_readable()).unwrap();
            });
            assert!(rx.recv_timeout(Duration::from_millis(20)).is_err());
            if attach {
                output.attach().unwrap();
            } else {
                output.cancel();
            }
            assert_eq!(rx.recv_timeout(Duration::from_secs(1)).unwrap(), attach);
            handle.join().unwrap();
            if !attach {
                assert!(output.attach().is_err());
            }
        }
    }

    #[test]
    fn concurrent_attachment_and_read_never_duplicate_or_reorder() {
        let sink = Arc::new(Sink::default());
        let output = SessionOutput::new(sink.clone());
        output.push(0, b"first");
        let reader = output.clone();
        let handle = std::thread::spawn(move || {
            reader.push(0, b"second");
            reader.finish();
        });
        output.attach().unwrap();
        handle.join().unwrap();
        output.attach().unwrap();
        assert_eq!(
            *sink.events.lock().unwrap(),
            ["out:first", "out:second", "exit:None"]
        );
    }

    #[tokio::test]
    async fn async_backpressure_is_cancellation_aware() {
        let output = SessionOutput::new(Arc::new(Sink::default()));
        output.push(0, &vec![b'x'; STARTUP_BUDGET]);
        let reader = output.clone();
        let wait = tokio::spawn(async move { reader.wait_until_readable_async().await });
        tokio::task::yield_now().await;
        assert!(!wait.is_finished());
        output.cancel();
        assert!(!tokio::time::timeout(Duration::from_secs(1), wait)
            .await
            .unwrap()
            .unwrap());
    }

    #[test]
    fn root_status_grace_completes_without_waiting_for_an_inherited_reader() {
        let output = SessionOutput::new(Arc::new(Sink::default()));
        output.record_eof();
        assert!(!output.ready_to_finish());
        output.record_status(0);
        assert!(output.ready_to_finish());
        output.state.lock().unwrap().eof = false;
        assert!(!output.ready_to_finish());
        output.state.lock().unwrap().status_at = Some(Instant::now() - EXIT_DRAIN_GRACE);
        assert!(output.ready_to_finish());
        output.finish();
        assert!(output.stopped());
    }
}
