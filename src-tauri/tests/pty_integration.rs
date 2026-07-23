use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize, SlavePty};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

type PtyTuple = (
    Box<dyn MasterPty + Send>,
    Box<dyn SlavePty + Send>,
    Box<dyn portable_pty::Child + Send + Sync>,
);

fn open_pty_shell(program: &str, args: &[&str]) -> Option<PtyTuple> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("openpty");

    let mut cmd = CommandBuilder::new(program);
    for arg in args {
        cmd.arg(*arg);
    }

    let child = pair.slave.spawn_command(cmd).ok()?;
    Some((pair.master, pair.slave, child))
}

fn open_pwsh_pty() -> Option<PtyTuple> {
    open_pty_shell("pwsh", &["-NoLogo", "-NoProfile"])
}

fn open_cmd_pty() -> Option<PtyTuple> {
    open_pty_shell("cmd", &["/Q", "/K"])
}

#[test]
fn shell_exits_on_exit_command() {
    let (master, _slave, mut child) = open_pwsh_pty()
        .or_else(open_cmd_pty)
        .expect("pwsh or cmd must be available for PTY integration tests");
    let mut writer = master.take_writer().expect("writer");
    let mut reader = master.try_clone_reader().expect("reader");

    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 {
                break;
            }
        }
    });

    std::thread::sleep(Duration::from_millis(750));
    writer.write_all(b"exit\r\n").expect("write exit");
    writer.flush().expect("flush");

    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        if child.try_wait().ok().flatten().is_some() {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    panic!("shell did not exit after exit command within timeout");
}

#[test]
fn pwsh_reads_and_writes_in_pty() {
    let (master, _slave, _child) = open_pwsh_pty()
        .or_else(open_cmd_pty)
        .expect("pwsh or cmd must be available for PTY integration tests");
    let mut writer = master.take_writer().expect("writer");
    let mut reader = master.try_clone_reader().expect("reader");

    let output_buffer = Arc::new(Mutex::new(String::new()));
    let output_clone = Arc::clone(&output_buffer);

    std::thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        while let Ok(count) = reader.read(&mut buffer) {
            if count == 0 {
                break;
            }
            let text = String::from_utf8_lossy(&buffer[..count]);
            if let Ok(mut lock) = output_clone.lock() {
                lock.push_str(&text);
            }
        }
    });

    std::thread::sleep(Duration::from_millis(750));
    writer
        .write_all(b"echo oterm-pty-test\r\n")
        .expect("write command");
    writer.flush().expect("flush");

    let deadline = Instant::now() + Duration::from_secs(10);

    while Instant::now() < deadline {
        if let Ok(lock) = output_buffer.lock() {
            if lock.contains("oterm-pty-test") {
                return;
            }
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    let collected = output_buffer.lock().unwrap().clone();
    panic!(
        "expected echo output in PTY, got {} bytes: {:?}",
        collected.len(),
        collected.chars().take(400).collect::<String>()
    );
}
