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

pub fn default_shell_id() -> String {
    let preferred = preferred_system_shell_id();
    if resolve_shell(&preferred).is_some() {
        return preferred;
    }
    available_shells()
        .first()
        .map(|shell| shell.id.clone())
        .unwrap_or_else(|| "cmd".into())
}

fn preferred_system_shell_id() -> String {
    #[cfg(windows)]
    {
        std::env::var("COMSPEC")
            .ok()
            .and_then(|path| shell_id_from_comspec(&path))
            .unwrap_or_else(|| "cmd".into())
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL")
            .ok()
            .and_then(|path| shell_id_from_shell_path(&path))
            .unwrap_or_else(|| "bash".into())
    }
}

fn shell_id_from_comspec(path: &str) -> Option<String> {
    let lower = path.to_lowercase();
    if lower.ends_with("cmd.exe") {
        return Some("cmd".into());
    }
    if lower.contains("pwsh") {
        return Some("pwsh".into());
    }
    if lower.ends_with("powershell.exe") {
        return Some("powershell".into());
    }
    None
}

#[cfg(not(windows))]
fn shell_id_from_shell_path(path: &str) -> Option<String> {
    let lower = path.to_lowercase();
    if lower.contains("bash") {
        return Some("bash".into());
    }
    None
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

    #[test]
    fn cmd_comspec_maps_to_cmd() {
        assert_eq!(
            shell_id_from_comspec(r"C:\Windows\System32\cmd.exe").as_deref(),
            Some("cmd")
        );
    }

    #[test]
    fn pwsh_comspec_maps_to_pwsh() {
        assert_eq!(
            shell_id_from_comspec(r"C:\Program Files\PowerShell\7\pwsh.exe").as_deref(),
            Some("pwsh")
        );
    }

    #[test]
    fn default_shell_id_returns_resolvable_shell() {
        let id = default_shell_id();
        assert!(resolve_shell(&id).is_some());
    }
}
