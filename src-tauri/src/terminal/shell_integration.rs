use std::fs;
use std::path::{Path, PathBuf};

const INTEGRATION_PS1: &str = include_str!("../../shell-integration/oterm.ps1");
const INTEGRATION_BASH: &str = include_str!("../../shell-integration/oterm.bash");
const INTEGRATION_ZSH: &str = include_str!("../../shell-integration/oterm.zsh");
const INTEGRATION_FISH: &str = include_str!("../../shell-integration/oterm.fish");
const INTEGRATION_CMD: &str = include_str!("../../shell-integration/oterm.cmd");
const INTEGRATION_NU: &str = include_str!("../../shell-integration/oterm.nu");
const INTEGRATION_ELV: &str = include_str!("../../shell-integration/oterm.elv");

#[derive(Debug, Clone)]
pub struct ShellLaunchPlan {
    pub extra_args: Vec<String>,
    pub env: Vec<(String, String)>,
}

pub fn prepare_shell_launch(shell_id: &str) -> Result<ShellLaunchPlan, String> {
    let root = integration_root()?;
    write_integration_assets(&root)?;

    match shell_id {
        "pwsh" | "powershell" => Ok(launch_powershell(&root, shell_id)),
        "cmd" => Ok(launch_cmd(&root)),
        "bash" => Ok(launch_posix(&root, "bash", "oterm.bash")),
        "zsh" => Ok(launch_posix(&root, "zsh", "oterm.zsh")),
        "fish" => Ok(launch_posix(&root, "fish", "oterm.fish")),
        "nu" => Ok(launch_posix(&root, "nu", "oterm.nu")),
        "elvish" => Ok(launch_posix(&root, "elvish", "oterm.elv")),
        "wsl" => Ok(launch_wsl(&root)),
        _ => Ok(ShellLaunchPlan {
            extra_args: Vec::new(),
            env: vec![("OTERM_SHELL_INTEGRATION".into(), "0".into())],
        }),
    }
}

fn integration_root() -> Result<PathBuf, String> {
    let base = std::env::temp_dir().join("oterm").join("shell-integration");
    fs::create_dir_all(&base).map_err(|err| err.to_string())?;
    Ok(base)
}

fn write_integration_assets(root: &Path) -> Result<(), String> {
    write_file(root.join("oterm.ps1"), INTEGRATION_PS1)?;
    write_file(root.join("oterm.bash"), INTEGRATION_BASH)?;
    write_file(root.join("oterm.zsh"), INTEGRATION_ZSH)?;
    write_file(root.join("oterm.fish"), INTEGRATION_FISH)?;
    write_file(root.join("oterm.cmd"), INTEGRATION_CMD)?;
    write_file(root.join("oterm.nu"), INTEGRATION_NU)?;
    write_file(root.join("oterm.elv"), INTEGRATION_ELV)?;
    Ok(())
}

fn write_file(path: PathBuf, contents: &str) -> Result<(), String> {
    fs::write(path, contents).map_err(|err| err.to_string())
}

fn ps1_path(root: &Path) -> String {
    root.join("oterm.ps1").to_string_lossy().into_owned()
}

fn posix_path(root: &Path, file: &str) -> String {
    root.join(file).to_string_lossy().into_owned()
}

fn launch_powershell(root: &Path, shell_id: &str) -> ShellLaunchPlan {
    let path = ps1_path(root);
    let escaped = escape_ps_single(&path);
    let command = format!("& {{ . '{escaped}' }}");
    let mut extra_args = vec!["-NoExit".into(), "-Command".into(), command];
    if shell_id == "powershell" {
        extra_args.insert(0, "-NoLogo".into());
    }
    ShellLaunchPlan {
        extra_args,
        env: vec![("OTERM_SHELL_INTEGRATION".into(), "1".into())],
    }
}

fn launch_cmd(root: &Path) -> ShellLaunchPlan {
    let path = root.join("oterm.cmd").to_string_lossy().into_owned();
    ShellLaunchPlan {
        extra_args: vec!["/K".into(), path],
        env: vec![("OTERM_SHELL_INTEGRATION".into(), "1".into())],
    }
}

fn launch_posix(root: &Path, shell: &str, file: &str) -> ShellLaunchPlan {
    let path = posix_path(root, file);
    let escaped = escape_sh_single(&path);
    let command = match shell {
        "fish" => format!("source '{escaped}'; exec fish"),
        "nu" => format!("source '{escaped}'; exec nu"),
        "elvish" => format!("source '{escaped}'; exec elvish"),
        "zsh" => format!("source '{escaped}'; exec zsh -l"),
        _ => format!("source '{escaped}'; exec bash -l"),
    };
    ShellLaunchPlan {
        extra_args: vec!["-l".into(), "-c".into(), command],
        env: vec![("OTERM_SHELL_INTEGRATION".into(), "1".into())],
    }
}

fn launch_wsl(root: &Path) -> ShellLaunchPlan {
    let path = posix_path(root, "oterm.bash");
    let wsl_path = windows_to_wsl_path(&path);
    let escaped = escape_sh_single(&wsl_path);
    let command = format!("source '{escaped}'; exec bash -l");
    ShellLaunchPlan {
        extra_args: vec![
            "-e".into(),
            "bash".into(),
            "-l".into(),
            "-c".into(),
            command,
        ],
        env: vec![("OTERM_SHELL_INTEGRATION".into(), "1".into())],
    }
}

fn windows_to_wsl_path(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    if normalized.len() >= 2 && normalized.as_bytes()[1] == b':' {
        let drive = normalized.as_bytes()[0].to_ascii_lowercase() as char;
        format!("/mnt/{drive}/{}", &normalized[3..])
    } else {
        normalized
    }
}

fn escape_ps_single(value: &str) -> String {
    value.replace('\'', "''")
}

fn escape_sh_single(value: &str) -> String {
    value.replace('\'', "'\\''")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_integration_assets() {
        let root = integration_root().expect("temp dir");
        write_integration_assets(&root).expect("write assets");
        assert!(root.join("oterm.ps1").is_file());
        assert!(root.join("oterm.bash").is_file());
    }

    #[test]
    fn maps_windows_path_for_wsl() {
        assert_eq!(
            windows_to_wsl_path(r"C:\Users\Filip\AppData\Local\Temp\oterm\oterm.bash"),
            "/mnt/c/Users/Filip/AppData/Local/Temp/oterm/oterm.bash"
        );
    }

    #[test]
    fn pwsh_launch_includes_integration_command() {
        let root = integration_root().expect("temp dir");
        let plan = launch_powershell(&root, "pwsh");
        assert!(plan.extra_args.iter().any(|arg| arg.contains("oterm.ps1")));
        assert!(plan.extra_args.iter().any(|arg| arg.contains("& { . ")));
    }
}
