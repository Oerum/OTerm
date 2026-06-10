use crate::fs::expand_path;
use std::path::PathBuf;
use tauri::State;

pub struct LaunchState {
    pub initial_cwd: Option<String>,
}

impl LaunchState {
    pub fn from_args() -> Self {
        Self {
            initial_cwd: parse_launch_cwd_from_args(std::env::args()),
        }
    }
}

#[tauri::command]
pub fn launch_initial_cwd(state: State<'_, LaunchState>) -> Option<String> {
    state.initial_cwd.clone()
}

fn parse_launch_cwd_from_args<I, S>(args: I) -> Option<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let args: Vec<String> = args
        .into_iter()
        .map(|arg| arg.as_ref().to_string())
        .collect();

    let raw = args.iter().enumerate().find_map(|(index, arg)| {
        if arg == "--cwd" || arg == "--working-directory" {
            return args.get(index + 1).cloned();
        }
        if let Some(value) = arg.strip_prefix("--cwd=") {
            return Some(value.to_string());
        }
        if let Some(value) = arg.strip_prefix("--working-directory=") {
            return Some(value.to_string());
        }
        None
    });

    raw.and_then(|value| resolve_launch_cwd(&value))
}

fn resolve_launch_cwd(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut path = expand_path(trimmed).ok()?;
    if !path.is_dir() {
        return None;
    }

    if path.is_relative() {
        if let Ok(current_dir) = std::env::current_dir() {
            path = current_dir.join(path);
        }
    }

    path_to_string(path)
}

fn path_to_string(path: PathBuf) -> Option<String> {
    path.into_os_string().into_string().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn parse_launch_cwd_from_flag_value() {
        let temp = std::env::temp_dir();
        let args = vec![
            "oterm.exe".to_string(),
            "--cwd".to_string(),
            temp.to_string_lossy().into_owned(),
        ];
        let cwd = parse_launch_cwd_from_args(args).expect("expected cwd");
        assert_eq!(cwd, temp.to_string_lossy());
    }

    #[test]
    fn parse_launch_cwd_from_equals_form() {
        let temp = std::env::temp_dir();
        let arg = format!("--cwd={}", temp.to_string_lossy());
        let cwd =
            parse_launch_cwd_from_args(vec!["oterm.exe".to_string(), arg]).expect("expected cwd");
        assert_eq!(cwd, temp.to_string_lossy());
    }

    #[test]
    fn parse_launch_cwd_missing_flag_returns_none() {
        assert!(parse_launch_cwd_from_args(vec!["oterm.exe".to_string()]).is_none());
    }

    #[test]
    fn parse_launch_cwd_invalid_path_returns_none() {
        let args = vec![
            "oterm.exe".to_string(),
            "--cwd".to_string(),
            "/nonexistent/path/for/oterm-test".to_string(),
        ];
        assert!(parse_launch_cwd_from_args(args).is_none());
    }

    #[test]
    fn parse_launch_cwd_expands_home() {
        let home = crate::fs::user_home().expect("home");
        let cwd = parse_launch_cwd_from_args(vec![
            "oterm.exe".to_string(),
            "--cwd".to_string(),
            "~".to_string(),
        ])
        .expect("expected cwd");
        assert_eq!(cwd, home.to_string_lossy());
    }

    #[test]
    fn parse_launch_cwd_rejects_file_path() {
        let temp = std::env::temp_dir();
        let file = temp.join(format!("oterm-launch-test-{}", std::process::id()));
        fs::write(&file, "x").expect("write temp file");
        let args = vec![
            "oterm.exe".to_string(),
            "--cwd".to_string(),
            file.to_string_lossy().into_owned(),
        ];
        assert!(parse_launch_cwd_from_args(args).is_none());
        let _ = fs::remove_file(file);
    }
}
