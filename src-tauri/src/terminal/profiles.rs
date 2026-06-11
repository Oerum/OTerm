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

    if let Some(path) = resolve_program(&["pwsh"]) {
        push_shell(
            &mut shells,
            ShellProfile {
                id: "pwsh".into(),
                label: "PowerShell 7".into(),
                program: path,
                args: vec!["-NoLogo".into()],
            },
        );
    }

    if let Some(path) = resolve_program(&["powershell"]) {
        push_shell(
            &mut shells,
            ShellProfile {
                id: "powershell".into(),
                label: "Windows PowerShell".into(),
                program: path,
                args: vec!["-NoLogo".into()],
            },
        );
    }

    if let Some(path) = resolve_program(&["cmd"]) {
        push_shell(
            &mut shells,
            ShellProfile {
                id: "cmd".into(),
                label: "Command Prompt".into(),
                program: path,
                args: vec!["/Q".into(), "/K".into(), "cls".into()],
            },
        );
    }

    if let Some(path) = resolve_program(&["wsl"]) {
        push_shell(
            &mut shells,
            ShellProfile {
                id: "wsl".into(),
                label: "WSL".into(),
                program: path,
                args: vec![],
            },
        );
    }

    if let Some(path) = resolve_program_with_fallbacks(&["bash"], &bash_fallback_paths()) {
        push_shell(
            &mut shells,
            ShellProfile {
                id: "bash".into(),
                label: "Bash".into(),
                program: path,
                args: vec![],
            },
        );
    }

    if let Some(path) =
        resolve_program_with_fallbacks(&["fish", "fish.exe"], &fish_fallback_paths())
    {
        push_shell(
            &mut shells,
            ShellProfile {
                id: "fish".into(),
                label: "Fish".into(),
                program: path,
                args: vec![],
            },
        );
    }

    if let Some(path) = resolve_program_with_fallbacks(&["zsh"], &zsh_fallback_paths()) {
        push_shell(
            &mut shells,
            ShellProfile {
                id: "zsh".into(),
                label: "Zsh".into(),
                program: path,
                args: vec!["-l".into()],
            },
        );
    }

    if let Some(path) = resolve_program_with_fallbacks(&["nu", "nu.exe"], &nu_fallback_paths()) {
        push_shell(
            &mut shells,
            ShellProfile {
                id: "nu".into(),
                label: "Nu Shell".into(),
                program: path,
                args: vec![],
            },
        );
    }

    if let Some(path) = resolve_program(&["elvish"]) {
        push_shell(
            &mut shells,
            ShellProfile {
                id: "elvish".into(),
                label: "Elvish".into(),
                program: path,
                args: vec![],
            },
        );
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
    let shells = available_shells();
    let preferred = preferred_system_shell_id();
    if shells.iter().any(|shell| shell.id == preferred) {
        return preferred;
    }
    shells
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

#[cfg(windows)]
fn shell_id_from_comspec(path: &str) -> Option<String> {
    shell_id_from_executable_path(path)
}

#[cfg(not(windows))]
fn shell_id_from_shell_path(path: &str) -> Option<String> {
    shell_id_from_executable_path(path)
}

fn shell_id_from_executable_path(path: &str) -> Option<String> {
    let lower = path.to_lowercase();
    if lower.ends_with("cmd.exe") || lower.ends_with("/cmd") {
        return Some("cmd".into());
    }
    if lower.contains("pwsh") {
        return Some("pwsh".into());
    }
    if lower.ends_with("powershell.exe") || lower.ends_with("/powershell") {
        return Some("powershell".into());
    }
    if lower.contains("fish") {
        return Some("fish".into());
    }
    if lower.contains("zsh") {
        return Some("zsh".into());
    }
    if lower.contains("nushell") || lower.ends_with("/nu") || lower.ends_with("\\nu.exe") {
        return Some("nu".into());
    }
    if lower.contains("elvish") {
        return Some("elvish".into());
    }
    if lower.contains("bash") {
        return Some("bash".into());
    }
    None
}

fn push_shell(shells: &mut Vec<ShellProfile>, profile: ShellProfile) {
    if shells.iter().any(|shell| shell.id == profile.id) {
        return;
    }
    shells.push(profile);
}

fn resolve_program(names: &[&str]) -> Option<String> {
    for name in names {
        if let Some(path) = find_executable(name) {
            return Some(path);
        }
    }
    None
}

fn resolve_program_with_fallbacks(names: &[&str], fixed_paths: &[PathBuf]) -> Option<String> {
    resolve_program(names).or_else(|| first_existing_file(fixed_paths))
}

fn first_existing_file(paths: &[PathBuf]) -> Option<String> {
    paths
        .iter()
        .find(|path| path.is_file())
        .map(|path| path.to_string_lossy().into_owned())
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

fn bash_fallback_paths() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var("ProgramFiles")
            .ok()
            .map(|root| vec![PathBuf::from(root).join("Git").join("bin").join("bash.exe")])
            .unwrap_or_default()
    }
    #[cfg(not(windows))]
    {
        vec![PathBuf::from("/bin/bash")]
    }
}

fn fish_fallback_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    #[cfg(windows)]
    {
        if let Ok(root) = std::env::var("ProgramFiles") {
            paths.push(PathBuf::from(&root).join("fish").join("fish.exe"));
            paths.push(
                PathBuf::from(&root)
                    .join("Git")
                    .join("usr")
                    .join("bin")
                    .join("fish.exe"),
            );
        }
    }
    #[cfg(target_os = "macos")]
    {
        paths.push(PathBuf::from("/opt/homebrew/bin/fish"));
        paths.push(PathBuf::from("/usr/local/bin/fish"));
    }
    #[cfg(target_os = "linux")]
    {
        paths.push(PathBuf::from("/usr/bin/fish"));
    }
    paths
}

fn zsh_fallback_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    #[cfg(windows)]
    {
        paths.push(PathBuf::from(r"C:\msys64\usr\bin\zsh.exe"));
    }
    #[cfg(target_os = "macos")]
    {
        paths.push(PathBuf::from("/opt/homebrew/bin/zsh"));
        paths.push(PathBuf::from("/usr/local/bin/zsh"));
        paths.push(PathBuf::from("/bin/zsh"));
    }
    #[cfg(target_os = "linux")]
    {
        paths.push(PathBuf::from("/usr/bin/zsh"));
        paths.push(PathBuf::from("/bin/zsh"));
    }
    paths
}

fn nu_fallback_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    #[cfg(windows)]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            paths.push(
                PathBuf::from(&local)
                    .join("Programs")
                    .join("Nu")
                    .join("bin")
                    .join("nu.exe"),
            );
        }
    }
    #[cfg(target_os = "macos")]
    {
        paths.push(PathBuf::from("/opt/homebrew/bin/nu"));
        paths.push(PathBuf::from("/usr/local/bin/nu"));
    }
    #[cfg(target_os = "linux")]
    {
        paths.push(PathBuf::from("/usr/bin/nu"));
    }
    paths
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

    #[test]
    fn push_shell_skips_duplicate_ids() {
        let mut shells = Vec::new();
        push_shell(
            &mut shells,
            ShellProfile {
                id: "fish".into(),
                label: "Fish".into(),
                program: "/usr/bin/fish".into(),
                args: vec![],
            },
        );
        push_shell(
            &mut shells,
            ShellProfile {
                id: "fish".into(),
                label: "Fish duplicate".into(),
                program: "/opt/homebrew/bin/fish".into(),
                args: vec![],
            },
        );
        assert_eq!(shells.len(), 1);
        assert_eq!(shells[0].program, "/usr/bin/fish");
    }

    #[test]
    fn first_existing_file_returns_first_match() {
        let dir = std::env::temp_dir();
        let existing = dir.join("oterm-shell-test-existing");
        let _ = std::fs::write(&existing, b"");
        let missing = dir.join("oterm-shell-test-missing");

        let result = first_existing_file(&[missing, existing.clone()]);
        assert_eq!(result.as_deref(), Some(existing.to_string_lossy().as_ref()));

        let _ = std::fs::remove_file(existing);
    }

    #[cfg(not(windows))]
    #[test]
    fn shell_path_maps_fish_zsh_and_nu() {
        assert_eq!(
            shell_id_from_shell_path("/usr/bin/fish").as_deref(),
            Some("fish")
        );
        assert_eq!(
            shell_id_from_shell_path("/opt/homebrew/bin/zsh").as_deref(),
            Some("zsh")
        );
        assert_eq!(
            shell_id_from_shell_path("/usr/local/bin/nu").as_deref(),
            Some("nu")
        );
        assert_eq!(
            shell_id_from_shell_path("/home/user/.cargo/bin/nu").as_deref(),
            Some("nu")
        );
        assert_eq!(
            shell_id_from_shell_path("/usr/bin/elvish").as_deref(),
            Some("elvish")
        );
    }

    #[test]
    fn executable_path_maps_fish_zsh_and_nu_on_windows_style_paths() {
        assert_eq!(
            shell_id_from_executable_path(r"C:\Program Files\fish\fish.exe").as_deref(),
            Some("fish")
        );
        assert_eq!(
            shell_id_from_executable_path(r"C:\msys64\usr\bin\zsh.exe").as_deref(),
            Some("zsh")
        );
        assert_eq!(
            shell_id_from_executable_path(r"C:\Users\me\AppData\Local\Programs\Nu\bin\nu.exe")
                .as_deref(),
            Some("nu")
        );
    }
}
