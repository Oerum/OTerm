use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::time::{Duration, Instant};

fn open_pty_shell(
    program: &str,
    args: &[&str],
) -> Option<(
    Box<dyn MasterPty + Send>,
    Box<dyn portable_pty::Child + Send + Sync>,
)> {
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
    drop(pair.slave);
    let master: Box<dyn MasterPty + Send> = pair.master;
    Some((master, child))
}

fn open_pwsh_pty() -> Option<(
    Box<dyn MasterPty + Send>,
    Box<dyn portable_pty::Child + Send + Sync>,
)> {
    open_pty_shell("pwsh", &["-NoLogo"])
}

fn open_cmd_pty() -> Option<(
    Box<dyn MasterPty + Send>,
    Box<dyn portable_pty::Child + Send + Sync>,
)> {
    open_pty_shell("cmd", &["/Q", "/K"])
}

#[test]
fn shell_exits_on_exit_command() {
    let (master, mut child) = open_pwsh_pty()
        .or_else(open_cmd_pty)
        .expect("pwsh or cmd must be available for PTY integration tests");
    let mut writer = master.take_writer().expect("writer");

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
    let (master, _child) =
        open_pwsh_pty().expect("pwsh must be available for PTY integration tests");
    let mut writer = master.take_writer().expect("writer");
    let mut reader = master.try_clone_reader().expect("reader");

    writer
        .write_all(b"echo oterm-pty-test\r")
        .expect("write command");
    writer.flush().expect("flush");

    let deadline = Instant::now() + Duration::from_secs(5);
    let mut collected = String::new();
    let mut buffer = [0u8; 4096];

    while Instant::now() < deadline {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => {
                collected.push_str(&String::from_utf8_lossy(&buffer[..count]));
                if collected.contains("oterm-pty-test") {
                    return;
                }
            }
            Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(err) => panic!("read failed: {err}"),
        }
    }

    panic!(
        "expected echo output in PTY, got {} bytes: {:?}",
        collected.len(),
        collected.chars().take(400).collect::<String>()
    );
}
