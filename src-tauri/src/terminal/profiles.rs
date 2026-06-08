use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellProfile {
    pub id: String,
    pub label: String,
    pub program: String,
    pub args: Vec<String>,
}

pub fn available_shells() -> Vec<ShellProfile> {
    let mut shells = Vec::new();

    if let Some(path) = find_executable("pwsh") {
        shells.push(ShellProfile {
            id: "pwsh".into(),
            label: "PowerShell 7".into(),
            program: path,
            args: vec!["-NoLogo".into()],
        });
    }

    if let Some(path) = find_executable("powershell") {
        shells.push(ShellProfile {
            id: "powershell".into(),
            label: "Windows PowerShell".into(),
            program: path,
            args: vec!["-NoLogo".into()],
        });
    }

    if let Some(path) = find_executable("cmd") {
        shells.push(ShellProfile {
            id: "cmd".into(),
            label: "Command Prompt".into(),
            program: path,
            args: vec!["/Q".into(), "/K".into(), "cls".into()],
        });
    }

    if let Some(path) = find_executable("wsl") {
        shells.push(ShellProfile {
            id: "wsl".into(),
            label: "WSL".into(),
            program: path,
            args: vec![],
        });
    }

    if let Some(path) = find_executable("bash") {
        shells.push(ShellProfile {
            id: "bash".into(),
            label: "Bash".into(),
            program: path,
            args: vec![],
        });
    }

    if shells.is_empty() {
        shells.push(ShellProfile {
            id: "cmd".into(),
            label: "Command Prompt".into(),
            program: "cmd.exe".into(),
            args: vec![],
        });
    }

    shells
}

pub fn resolve_shell(shell_id: &str) -> Option<ShellProfile> {
    available_shells()
        .into_iter()
        .find(|shell| shell.id == shell_id)
}

fn find_executable(name: &str) -> Option<String> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        for candidate in candidate_paths(dir, name) {
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().into_owned());
            }
        }
    }
    None
}

fn candidate_paths(dir: PathBuf, name: &str) -> Vec<PathBuf> {
    if cfg!(windows) {
        vec![dir.join(name), dir.join(format!("{name}.exe"))]
    } else {
        vec![dir.join(name)]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_at_least_one_shell() {
        assert!(!available_shells().is_empty());
    }

    #[test]
    fn resolves_known_shell_id() {
        let shells = available_shells();
        let first = shells.first().unwrap();
        assert!(resolve_shell(&first.id).is_some());
    }
}
