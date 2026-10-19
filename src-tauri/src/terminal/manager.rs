use crate::terminal::agent_process::{detect_agent_in_tree, refresh_processes, ProcessTree};
use crate::terminal::output::{Attachment, SessionOutput};
use crate::terminal::profiles::{resolve_shell, ShellProfile};
use crate::terminal::shell_integration::prepare_shell_launch;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::{HashMap, HashSet};
use std::io::{ErrorKind, Read, Write};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, Arc<PtySession>>>>,
    monitor: Mutex<Option<thread::JoinHandle<()>>>,
    monitor_stop: Arc<(Mutex<bool>, Condvar)>,
}

struct PtySession {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    output: Arc<SessionOutput>,
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    root_pid: u32,
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
            sessions: Arc::new(Mutex::new(HashMap::new())),
            monitor: Mutex::new(None),
            monitor_stop: Arc::new((Mutex::new(false), Condvar::new())),
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

        let output = SessionOutput::for_app(app.clone(), session_id.clone());
        let child = Arc::new(Mutex::new(child));
        let session = Arc::new(PtySession {
            master: Mutex::new(master),
            writer: Mutex::new(writer),
            output: output.clone(),
            child: child.clone(),
            root_pid,
        });
        self.sessions
            .lock()
            .map_err(|_| "Session lock poisoned".to_string())?
            .insert(session_id.clone(), session);

        spawn_reader(reader, output.clone());
        spawn_child_exit_watcher(child, output);
        self.start_agent_monitor(app);
        self.monitor_stop.1.notify_all();
        Ok(session_id)
    }

    fn session(&self, session_id: &str) -> Result<Arc<PtySession>, String> {
        self.sessions
            .lock()
            .map_err(|_| "Session lock poisoned".to_string())?
            .get(session_id)
            .cloned()
            .ok_or_else(|| format!("Unknown session: {session_id}"))
    }

    pub fn attach_output(&self, session_id: &str) -> Result<Attachment, String> {
        self.session(session_id)?.output.attach()
    }

    pub fn write(&self, session_id: &str, data: &str) -> Result<(), String> {
        let session = self.session(session_id)?;
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
        let session = self.session(session_id)?;
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
        let root_pid = self.session(session_id)?.root_pid;
        let mut system = sysinfo::System::new();
        Ok(detect_agent_in_tree(&mut system, root_pid))
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

    fn teardown_session(session: Arc<PtySession>) {
        session.output.cancel();
        if let Ok(mut child) = session.child.lock() {
            let _ = child.kill();
        }
    }

    fn start_agent_monitor(&self, app: AppHandle) {
        let mut monitor = self.monitor.lock().unwrap();
        if monitor.is_some() {
            return;
        }
        let sessions = self.sessions.clone();
        let stop = self.monitor_stop.clone();
        *monitor = Some(thread::spawn(move || {
            let mut monitor = AgentMonitor::default();
            loop {
                let roots = sessions
                    .lock()
                    .unwrap()
                    .iter()
                    .map(|(id, session)| (id.clone(), session.root_pid, session.output.clone()))
                    .collect();
                monitor.sweep(
                    roots,
                    |id, (agent, name, command), agent_changed, process_changed, output| {
                        if agent_changed && !output.stopped() {
                            let _ = app.emit(
                                "terminal-agent-changed",
                                TerminalAgentChangedEvent {
                                    session_id: id.to_string(),
                                    agent_id: agent.clone(),
                                },
                            );
                        }
                        if process_changed && !output.stopped() {
                            let _ = app.emit(
                                "terminal-process-changed",
                                TerminalProcessChangedEvent {
                                    session_id: id.to_string(),
                                    process_name: name.clone(),
                                    command: command.clone(),
                                },
                            );
                        }
                    },
                );
                let guard = stop.0.lock().unwrap();
                if *guard {
                    break;
                }
                let (guard, _) = stop
                    .1
                    .wait_timeout(guard, Duration::from_millis(1500))
                    .unwrap();
                if *guard {
                    break;
                }
            }
        }));
    }
}

type AgentObservation = (Option<String>, Option<String>, Option<String>);
type MonitoredRoot = (String, u32, Arc<SessionOutput>);

#[derive(Default)]
struct AgentMonitor {
    system: sysinfo::System,
    last: HashMap<String, AgentObservation>,
}

impl AgentMonitor {
    fn sweep(
        &mut self,
        mut roots: Vec<MonitoredRoot>,
        mut publish: impl FnMut(&str, &AgentObservation, bool, bool, &SessionOutput),
    ) {
        // Copy roots under the map lock; cancellation and OS scans happen after releasing it.
        roots.retain(|(_, _, output)| !output.stopped());
        let active_ids: HashSet<_> = roots.iter().map(|(id, _, _)| id).collect();
        self.last.retain(|id, _| active_ids.contains(id));
        if roots.is_empty() {
            return;
        }
        refresh_processes(&mut self.system);
        let tree = ProcessTree::new(&self.system);
        for (id, root_pid, output) in roots {
            if output.stopped() || !tree.contains(root_pid) {
                continue;
            }
            let agent = tree.detect_agent(root_pid);
            let process = tree.detect_active_process(root_pid);
            let (name, command) = process.map_or((None, None), |p| (Some(p.name), Some(p.command)));
            let current = (agent, name, command);
            let previous = self.last.entry(id.clone()).or_default();
            let agent_changed = current.0 != previous.0;
            let process_changed = current.1 != previous.1 || current.2 != previous.2;
            if !output.stopped() {
                publish(&id, &current, agent_changed, process_changed, &output);
            }
            *previous = current;
        }
    }
}

impl Drop for PtyManager {
    fn drop(&mut self) {
        *self.monitor_stop.0.lock().unwrap() = true;
        self.monitor_stop.1.notify_all();
        self.kill_all();
        if let Some(monitor) = self.monitor.lock().unwrap().take() {
            let _ = monitor.join();
        }
    }
}

fn default_cwd() -> Option<String> {
    std::env::var("USERPROFILE")
        .ok()
        .or_else(|| std::env::var("HOME").ok())
}

fn spawn_child_exit_watcher(
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    output: Arc<SessionOutput>,
) {
    thread::spawn(move || {
        let mut status_observed = false;
        while !output.stopped() {
            if !status_observed {
                if let Some(status) = child
                    .lock()
                    .ok()
                    .and_then(|mut c| c.try_wait().ok().flatten())
                {
                    output.record_status(status.exit_code() as i32);
                    status_observed = true;
                }
            }
            if output.ready_to_finish() {
                output.finish();
                break;
            }
            thread::sleep(Duration::from_millis(20));
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

fn spawn_reader(mut reader: Box<dyn Read + Send>, output: Arc<SessionOutput>) {
    thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        while output.wait_until_readable() {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => output.push(0, &buffer[..count]),
                Err(err) if err.kind() == ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(20))
                }
                Err(err) if err.kind() == ErrorKind::Interrupted => {}
                Err(_) => break,
            }
        }
        output.record_eof();
        if output.ready_to_finish() {
            output.finish();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::terminal::output::OutputSink;
    use std::sync::mpsc;

    #[derive(Default)]
    struct Sink {
        events: Mutex<Vec<String>>,
        exit: Option<mpsc::Sender<()>>,
    }
    impl OutputSink for Sink {
        fn output(&self, data: &str) -> Result<(), String> {
            self.events.lock().unwrap().push(format!("out:{data}"));
            Ok(())
        }
        fn exit(&self, code: Option<i32>) -> Result<(), String> {
            self.events.lock().unwrap().push(format!("exit:{code:?}"));
            if let Some(tx) = &self.exit {
                let _ = tx.send(());
            }
            Ok(())
        }
    }
    #[derive(Clone, Debug)]
    struct ExitedChild;
    impl portable_pty::ChildKiller for ExitedChild {
        fn kill(&mut self) -> std::io::Result<()> {
            Ok(())
        }
        fn clone_killer(&self) -> Box<dyn portable_pty::ChildKiller + Send + Sync> {
            Box::new(self.clone())
        }
    }
    impl portable_pty::Child for ExitedChild {
        fn try_wait(&mut self) -> std::io::Result<Option<portable_pty::ExitStatus>> {
            Ok(Some(portable_pty::ExitStatus::with_exit_code(6)))
        }
        fn wait(&mut self) -> std::io::Result<portable_pty::ExitStatus> {
            Ok(portable_pty::ExitStatus::with_exit_code(6))
        }
        fn process_id(&self) -> Option<u32> {
            Some(1)
        }
        #[cfg(windows)]
        fn as_raw_handle(&self) -> Option<std::os::windows::io::RawHandle> {
            None
        }
    }
    struct HeldReader {
        entered: mpsc::Sender<()>,
        release: mpsc::Receiver<()>,
        dropped: mpsc::Sender<()>,
    }
    impl Read for HeldReader {
        fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
            self.entered.send(()).unwrap();
            self.release.recv().unwrap();
            buffer[..4].copy_from_slice(b"late");
            Ok(4)
        }
    }
    impl Drop for HeldReader {
        fn drop(&mut self) {
            let _ = self.dropped.send(());
        }
    }

    #[test]
    fn root_exit_completes_while_reader_is_blocked_and_rejects_its_later_bytes() {
        let (exit_tx, exit_rx) = mpsc::channel();
        let sink = Arc::new(Sink {
            events: Mutex::new(Vec::new()),
            exit: Some(exit_tx),
        });
        let output = SessionOutput::new(sink.clone());
        output.attach().unwrap();
        output.push(0, b"final");
        let (entered_tx, entered_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let (dropped_tx, dropped_rx) = mpsc::channel();
        spawn_reader(
            Box::new(HeldReader {
                entered: entered_tx,
                release: release_rx,
                dropped: dropped_tx,
            }),
            output.clone(),
        );
        entered_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        spawn_child_exit_watcher(Arc::new(Mutex::new(Box::new(ExitedChild))), output.clone());
        let completed = exit_rx.recv_timeout(Duration::from_secs(2));
        // Release even on a failed assertion so this test never leaves a blocked test reader.
        release_tx.send(()).unwrap();
        completed.unwrap();
        dropped_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        assert_eq!(*sink.events.lock().unwrap(), ["out:final", "exit:Some(6)"]);
    }

    #[test]
    fn empty_and_cancelled_monitors_do_not_scan_or_keep_stale_sessions() {
        let mut monitor = AgentMonitor::default();
        monitor
            .last
            .insert("stale".into(), (Some("codex".into()), None, None));
        monitor.sweep(Vec::new(), |_, _, _, _, _| {
            panic!("empty monitor published")
        });
        assert!(monitor.system.processes().is_empty());
        assert!(monitor.last.is_empty());
        let cancelled = SessionOutput::new(Arc::new(Sink::default()));
        cancelled.cancel();
        monitor.sweep(
            vec![("cancelled".into(), std::process::id(), cancelled)],
            |_, _, _, _, _| panic!("cancelled monitor published"),
        );
        assert!(monitor.system.processes().is_empty());
        assert!(monitor.last.is_empty());
    }

    #[test]
    fn one_snapshot_tracks_many_roots_and_publishes_changes_once() {
        struct IdleChild(std::process::Child);
        impl Drop for IdleChild {
            fn drop(&mut self) {
                let _ = self.0.kill();
                let _ = self.0.wait();
            }
        }
        #[cfg(windows)]
        let mut command = {
            use std::os::windows::process::CommandExt;
            let mut command = std::process::Command::new("cmd.exe");
            command.args(["/D", "/Q", "/C", "set /p _="]);
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
            command
        };
        #[cfg(not(windows))]
        let mut command = {
            let mut command = std::process::Command::new("/bin/sh");
            command.args(["-c", "read -r _"]);
            command
        };
        // A builtin waits on the held stdin pipe without spawning descendants.
        let mut child = IdleChild(
            command
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .unwrap(),
        );
        assert!(child.0.try_wait().unwrap().is_none());
        let mut monitor = AgentMonitor::default();
        let roots = ["one", "two"].map(|id| {
            (
                id.to_string(),
                child.0.id(),
                SessionOutput::new(Arc::new(Sink::default())),
            )
        });
        for (id, _, _) in &roots {
            monitor.last.insert(
                id.clone(),
                (Some("previous".into()), Some("previous".into()), None),
            );
        }
        let mut changed = Vec::new();
        monitor.sweep(roots.to_vec(), |id, _, agent, process, _| {
            if agent || process {
                changed.push(id.to_string());
            }
        });
        changed.sort();
        assert_eq!(changed, ["one", "two"]);
        assert_eq!(monitor.last.len(), 2);
        monitor.sweep(roots.to_vec(), |_, _, agent, process, _| {
            assert!(!agent && !process);
        });
        for (_, _, output) in &roots {
            output.cancel();
        }
        monitor.sweep(roots.to_vec(), |_, _, _, _, _| {
            panic!("cancelled publication")
        });
        assert!(monitor.last.is_empty());
    }
}
