//! Hidden subprocess helpers for GUI builds on Windows.
//!
//! Release builds use `#![windows_subsystem = "windows"]`, so every
//! `Command::output()` without `CREATE_NO_WINDOW` allocates a visible console.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn hide_console(_cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        _cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

/// Console subprocess with stdout/stderr piped and no window (Windows release).
pub fn hidden_command(program: &Path) -> Command {
    let mut cmd = Command::new(program);
    hide_console(&mut cmd);
    cmd.stdin(Stdio::null());
    cmd
}

/// Like [`hidden_command`], but leaves stdin default for callers that pipe data in.
pub fn hidden_command_with_stdin(program: &Path) -> Command {
    let mut cmd = Command::new(program);
    hide_console(&mut cmd);
    cmd
}

/// Prefer `git.exe` on Windows so we never accidentally run `git.cmd` via cmd.exe.
pub fn git_program() -> PathBuf {
    resolve_program(&["git.exe", "git"]).unwrap_or_else(|| PathBuf::from("git"))
}

pub fn gh_program() -> PathBuf {
    resolve_program(&["gh.exe", "gh"]).unwrap_or_else(|| PathBuf::from("gh"))
}

pub fn docker_program() -> PathBuf {
    resolve_program(&["docker.exe", "docker"]).unwrap_or_else(|| PathBuf::from("docker"))
}

fn resolve_program(candidates: &[&str]) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        for name in candidates {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}
