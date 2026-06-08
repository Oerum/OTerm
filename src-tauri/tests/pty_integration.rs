use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::time::{Duration, Instant};

#[test]
fn pwsh_reads_and_writes_in_pty() {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("openpty");

    let mut cmd = CommandBuilder::new("pwsh");
    cmd.arg("-NoLogo");

    let mut child = pair.slave.spawn_command(cmd).expect("spawn pwsh");
    let mut writer = pair.master.take_writer().expect("writer");
    let mut reader = pair.master.try_clone_reader().expect("reader");

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
