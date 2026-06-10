pub mod commands;
pub mod context_menu;

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime};

pub const COMPOSER_ATTACHMENTS_MAX_AGE_DAYS: u64 = 7;

pub fn composer_attachments_dir() -> PathBuf {
    std::env::temp_dir()
        .join("oterm")
        .join("composer-attachments")
}

pub fn cleanup_old_composer_attachments(max_age_days: u64) -> Result<(), String> {
    let max_age = Duration::from_secs(max_age_days.saturating_mul(24 * 60 * 60));
    cleanup_old_composer_attachments_in(&composer_attachments_dir(), max_age)?;
    Ok(())
}

fn cleanup_old_composer_attachments_in(dir: &Path, max_age: Duration) -> Result<u32, String> {
    if !dir.is_dir() {
        return Ok(0);
    }

    let now = SystemTime::now();
    let mut deleted = 0u32;
    for entry in std::fs::read_dir(dir).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let modified = match entry.metadata().and_then(|meta| meta.modified()) {
            Ok(time) => time,
            Err(_) => continue,
        };
        let Ok(age) = now.duration_since(modified) else {
            continue;
        };
        if age <= max_age {
            continue;
        }
        if std::fs::remove_file(&path).is_ok() {
            deleted += 1;
        }
    }

    Ok(deleted)
}

pub fn expand_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed == "~" {
        return user_home().ok_or_else(|| "Home directory not found".to_string());
    }

    if trimmed.starts_with("~/") || trimmed.starts_with("~\\") {
        let home = user_home().ok_or_else(|| "Home directory not found".to_string())?;
        let rest = trimmed
            .trim_start_matches('~')
            .trim_start_matches('/')
            .trim_start_matches('\\');
        return Ok(home.join(rest));
    }

    Ok(PathBuf::from(trimmed))
}

pub fn user_home() -> Option<PathBuf> {
    std::env::var("USERPROFILE")
        .ok()
        .map(PathBuf::from)
        .or_else(|| std::env::var("HOME").ok().map(PathBuf::from))
}

pub fn default_project_root() -> Result<PathBuf, String> {
    expand_path("~")
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with('.'))
}

fn format_modified(time: SystemTime) -> Option<String> {
    use std::time::UNIX_EPOCH;
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_secs().to_string())
}

pub fn list_directory(path: &Path) -> Result<Vec<commands::FsEntry>, String> {
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", path.display()));
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(path).map_err(|err| err.to_string())?;

    for item in read_dir {
        let item = item.map_err(|err| err.to_string())?;
        let file_type = item.file_type().map_err(|err| err.to_string())?;
        let entry_path = item.path();
        if is_hidden(&entry_path) {
            continue;
        }
        let metadata = item.metadata().map_err(|err| err.to_string())?;

        entries.push(commands::FsEntry {
            name: item.file_name().to_string_lossy().into_owned(),
            path: entry_path.to_string_lossy().into_owned(),
            is_dir: file_type.is_dir(),
            size: if file_type.is_dir() {
                0
            } else {
                metadata.len()
            },
            modified: metadata.modified().ok().and_then(format_modified),
        });
    }

    entries.sort_by(|left, right| {
        right
            .is_dir
            .cmp(&left.is_dir)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(entries)
}

pub fn read_file_bytes(path: &Path) -> Result<Vec<u8>, String> {
    if path.is_dir() {
        return Err(format!("Not a file: {}", path.display()));
    }
    std::fs::read(path).map_err(|err| format!("Could not read file: {err}"))
}

pub fn write_file_bytes(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| format!("Could not create parent: {err}"))?;
    }
    std::fs::write(path, data).map_err(|err| format!("Could not write file: {err}"))
}

pub fn create_directory(path: &Path) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|err| format!("Could not create directory: {err}"))
}

pub fn remove_path(path: &Path, is_dir: bool) -> Result<(), String> {
    if is_dir {
        std::fs::remove_dir(path).map_err(|err| format!("Could not remove directory: {err}"))
    } else {
        std::fs::remove_file(path).map_err(|err| format!("Could not remove file: {err}"))
    }
}

const SEARCH_RESULT_LIMIT: usize = 100;
const SEARCH_MAX_DEPTH: usize = 12;

const SKIP_DIR_NAMES: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    ".cache",
    ".next",
    ".nuxt",
    ".turbo",
    ".pnpm-store",
    ".yarn",
    "__pycache__",
    "node_modules",
    "target",
    "dist",
    "build",
    "coverage",
    "vendor",
];

pub fn search_files(
    root: &Path,
    query: &str,
    is_cancelled: impl Fn() -> bool,
) -> Result<Vec<commands::FsEntry>, String> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    search_recursive(
        root,
        &needle,
        SEARCH_RESULT_LIMIT,
        SEARCH_MAX_DEPTH,
        0,
        &mut results,
        &is_cancelled,
    )?;
    Ok(results)
}

fn should_skip_dir(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    SKIP_DIR_NAMES.iter().any(|skip| lower == *skip)
}

fn search_recursive(
    current: &Path,
    needle: &str,
    limit: usize,
    max_depth: usize,
    depth: usize,
    results: &mut Vec<commands::FsEntry>,
    is_cancelled: &impl Fn() -> bool,
) -> Result<(), String> {
    if is_cancelled() || results.len() >= limit || depth > max_depth {
        return Ok(());
    }

    let read_dir = match std::fs::read_dir(current) {
        Ok(dir) => dir,
        Err(_) => return Ok(()),
    };

    for item in read_dir {
        if is_cancelled() || results.len() >= limit {
            break;
        }

        let item = match item {
            Ok(value) => value,
            Err(_) => continue,
        };
        let path = item.path();
        if is_hidden(&path) {
            continue;
        }

        let file_type = match item.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };

        let name = item.file_name().to_string_lossy().into_owned();
        if name.to_lowercase().contains(needle) {
            results.push(commands::FsEntry {
                name: name.clone(),
                path: path.to_string_lossy().into_owned(),
                is_dir: file_type.is_dir(),
                size: 0,
                modified: None,
            });
        }

        if file_type.is_dir() {
            if should_skip_dir(&name) {
                continue;
            }
            search_recursive(
                &path,
                needle,
                limit,
                max_depth,
                depth + 1,
                results,
                is_cancelled,
            )?;
        }
    }

    Ok(())
}

const ENV_IMPORT_MAX_DEPTH: usize = 64;

fn is_solution_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("sln") || ext.eq_ignore_ascii_case("slnx"))
}

pub fn list_solution_files(dir: &Path) -> Result<Vec<PathBuf>, String> {
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", dir.display()));
    }

    let mut solutions = Vec::new();
    let read_dir = match std::fs::read_dir(dir) {
        Ok(dir) => dir,
        Err(err) => return Err(err.to_string()),
    };

    for item in read_dir {
        let item = match item {
            Ok(value) => value,
            Err(_) => continue,
        };
        let file_type = match item.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        if !file_type.is_file() {
            continue;
        }
        let path = item.path();
        if is_solution_file(&path) {
            solutions.push(path);
        }
    }

    solutions.sort_by(|left, right| {
        let left_ext = left.extension().and_then(|ext| ext.to_str()).unwrap_or("");
        let right_ext = right.extension().and_then(|ext| ext.to_str()).unwrap_or("");
        let left_is_sln = left_ext.eq_ignore_ascii_case("sln");
        let right_is_sln = right_ext.eq_ignore_ascii_case("sln");
        right_is_sln.cmp(&left_is_sln).then_with(|| {
            left.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("")
                .to_lowercase()
                .cmp(
                    &right
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("")
                        .to_lowercase(),
                )
        })
    });

    Ok(solutions)
}

pub fn find_env_import_hint(dir: &Path) -> Option<(PathBuf, PathBuf)> {
    if !dir.is_dir() {
        return None;
    }

    let target = dir.join(".env");
    if target.exists() {
        return None;
    }

    let mut ancestor = dir.parent();
    let mut depth = 0;

    while let Some(current) = ancestor {
        if depth >= ENV_IMPORT_MAX_DEPTH {
            break;
        }
        let candidate = current.join(".env");
        if candidate.is_file() {
            return Some((candidate, target));
        }
        ancestor = current.parent();
        depth += 1;
    }

    None
}

pub fn import_env_file(dir: &Path) -> Result<(PathBuf, PathBuf), String> {
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", dir.display()));
    }

    let (source, target) = find_env_import_hint(dir)
        .ok_or_else(|| "No ancestor .env file found to import".to_string())?;

    if target.exists() {
        return Err(format!("Target already exists: {}", target.display()));
    }

    std::fs::copy(&source, &target).map_err(|err| {
        format!(
            "Could not copy {} to {}: {err}",
            source.display(),
            target.display()
        )
    })?;

    Ok((source, target))
}

#[cfg(windows)]
pub fn find_devenv_launcher() -> Option<PathBuf> {
    const EDITIONS: &[&str] = &["Community", "Professional", "Enterprise"];
    const VERSIONS: &[&str] = &["18", "2022", "2019"];

    if let Ok(program_files) = std::env::var("ProgramFiles") {
        let root = PathBuf::from(program_files).join("Microsoft Visual Studio");
        for version in VERSIONS {
            for edition in EDITIONS {
                let candidate = root
                    .join(version)
                    .join(edition)
                    .join("Common7")
                    .join("IDE")
                    .join("devenv.exe");
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }

        let vswhere = std::env::var("ProgramFiles(x86)")
            .map(|path| {
                PathBuf::from(path)
                    .join("Microsoft Visual Studio")
                    .join("Installer")
                    .join("vswhere.exe")
            })
            .unwrap_or_else(|_| root.join("Installer").join("vswhere.exe"));
        if vswhere.is_file() {
            let output = crate::process::hidden_command(&vswhere)
                .args([
                    "-latest",
                    "-products",
                    "*",
                    "-requires",
                    "Microsoft.Component.MSBuild",
                    "-property",
                    "installationPath",
                ])
                .output()
                .ok()?;

            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
                let install_path = stdout.trim();
                if !install_path.is_empty() {
                    let candidate = PathBuf::from(install_path)
                        .join("Common7")
                        .join("IDE")
                        .join("devenv.exe");
                    if candidate.is_file() {
                        return Some(candidate);
                    }
                }
            }
        }
    }

    None
}

#[cfg(not(windows))]
pub fn find_devenv_launcher() -> Option<PathBuf> {
    None
}

pub fn open_in_visual_studio(solution_path: &Path) -> Result<(), String> {
    let launcher = find_devenv_launcher()
        .ok_or_else(|| "Visual Studio (devenv.exe) was not found".to_string())?;

    open_solution_with_launcher(&launcher, "Visual Studio", solution_path)
}

fn open_solution_with_launcher(
    launcher: &Path,
    app_name: &str,
    solution_path: &Path,
) -> Result<(), String> {
    if !solution_path.is_file() {
        return Err(format!("Not a file: {}", solution_path.display()));
    }

    if !is_solution_file(solution_path) {
        return Err(format!(
            "Not a Visual Studio solution: {}",
            solution_path.display()
        ));
    }

    Command::new(launcher)
        .arg(solution_path)
        .spawn()
        .map(|_| ())
        .map_err(|err| format!("Could not launch {app_name} ({launcher:?}): {err}"))
}

fn which_on_path(names: &[&str]) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        for name in names {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn first_existing_file(candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates.iter().find(|path| path.is_file()).cloned()
}

fn find_jetbrains_toolbox_rider_bin() -> Option<PathBuf> {
    let toolbox_apps = jetbrains_toolbox_apps_dir().map(|root| root.join("Rider"));
    let apps_root = toolbox_apps.filter(|path| path.is_dir())?;

    let mut found = Vec::new();
    let read_dir = std::fs::read_dir(&apps_root).ok()?;
    for entry in read_dir.flatten() {
        let install_dir = entry.path();
        if !install_dir.is_dir() {
            continue;
        }
        for bin in rider_bin_names() {
            let candidate = install_dir.join("bin").join(bin);
            if candidate.is_file() {
                found.push(candidate);
            }
        }
    }

    found.sort();
    found.last().cloned()
}

fn jetbrains_toolbox_apps_dir() -> Option<PathBuf> {
    if cfg!(windows) {
        std::env::var("LOCALAPPDATA").ok().map(|dir| {
            PathBuf::from(dir)
                .join("JetBrains")
                .join("Toolbox")
                .join("apps")
        })
    } else if cfg!(target_os = "macos") {
        user_home().map(|home| {
            home.join("Library")
                .join("Application Support")
                .join("JetBrains")
                .join("Toolbox")
                .join("apps")
        })
    } else {
        user_home().map(|home| {
            home.join(".local")
                .join("share")
                .join("JetBrains")
                .join("Toolbox")
                .join("apps")
        })
    }
}

fn rider_bin_names() -> &'static [&'static str] {
    if cfg!(windows) {
        &["rider64.exe", "rider.exe"]
    } else {
        &["rider", "rider.sh"]
    }
}

pub fn find_rider_launcher() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let local_programs = std::env::var("LOCALAPPDATA").ok().map(PathBuf::from);
        let program_files = std::env::var("ProgramFiles").ok().map(PathBuf::from);

        let mut candidates = Vec::new();
        if let Some(local) = local_programs {
            candidates.push(
                local
                    .join("Programs")
                    .join("JetBrains Rider")
                    .join("bin")
                    .join("rider64.exe"),
            );
        }
        if let Some(toolbox) = find_jetbrains_toolbox_rider_bin() {
            candidates.push(toolbox);
        }
        if let Some(files) = program_files {
            if let Ok(entries) = std::fs::read_dir(files.join("JetBrains")) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .is_some_and(|name| name.starts_with("JetBrains Rider"))
                    {
                        candidates.push(path.join("bin").join("rider64.exe"));
                    }
                }
            }
        }

        first_existing_file(&candidates).or_else(|| which_on_path(rider_bin_names()))
    }

    #[cfg(target_os = "macos")]
    {
        let mut candidates = vec![
            PathBuf::from("/Applications/Rider.app/Contents/MacOS/rider"),
            PathBuf::from("/Applications/JetBrains Rider.app/Contents/MacOS/rider"),
        ];
        if let Some(home) = user_home() {
            candidates.push(
                home.join("Applications")
                    .join("Rider.app")
                    .join("Contents")
                    .join("MacOS")
                    .join("rider"),
            );
        }
        if let Some(toolbox) = find_jetbrains_toolbox_rider_bin() {
            candidates.push(toolbox);
        }
        first_existing_file(&candidates).or_else(|| which_on_path(rider_bin_names()))
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let mut candidates = vec![
            PathBuf::from("/opt/rider/bin/rider.sh"),
            PathBuf::from("/opt/rider/bin/rider"),
        ];
        if let Some(toolbox) = find_jetbrains_toolbox_rider_bin() {
            candidates.push(toolbox);
        }
        first_existing_file(&candidates).or_else(|| which_on_path(rider_bin_names()))
    }
}

pub fn open_in_rider(solution_path: &Path) -> Result<(), String> {
    let launcher =
        find_rider_launcher().ok_or_else(|| "JetBrains Rider was not found".to_string())?;
    open_solution_with_launcher(&launcher, "JetBrains Rider", solution_path)
}

pub fn find_vscode_launcher() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let mut candidates = Vec::new();
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let root = PathBuf::from(local_app_data)
                .join("Programs")
                .join("Microsoft VS Code")
                .join("bin");
            candidates.push(root.join("code.cmd"));
            candidates.push(root.join("code.exe"));
        }
        first_existing_file(&candidates)
            .or_else(|| which_on_path(&["code.cmd", "code.exe"]))
    }

    #[cfg(target_os = "macos")]
    {
        let candidates = [
            PathBuf::from("/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"),
            PathBuf::from(
                "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code",
            ),
        ];
        first_existing_file(&candidates).or_else(|| which_on_path(&["code"]))
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let candidates = [
            PathBuf::from("/usr/bin/code"),
            PathBuf::from("/usr/local/bin/code"),
            PathBuf::from("/snap/bin/code"),
        ];
        first_existing_file(&candidates).or_else(|| which_on_path(&["code"]))
    }
}

pub fn open_in_vscode(path: &Path) -> Result<(), String> {
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", path.display()));
    }

    let launcher = find_vscode_launcher().ok_or_else(|| "VS Code was not found".to_string())?;

    Command::new(&launcher)
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|err| format!("Could not launch VS Code ({launcher:?}): {err}"))
}

pub fn find_zed_launcher() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let bundled = PathBuf::from(local_app_data)
                .join("Programs")
                .join("Zed")
                .join("zed.exe");
            if bundled.is_file() {
                return Some(bundled);
            }
        }
        which_on_path(&["zed.exe", "zed"])
    }

    #[cfg(target_os = "macos")]
    {
        let candidates = [PathBuf::from("/Applications/Zed.app/Contents/MacOS/zed")];
        first_existing_file(&candidates).or_else(|| which_on_path(&["zed"]))
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        which_on_path(&["zed"])
    }
}

pub fn open_in_zed(path: &Path) -> Result<(), String> {
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", path.display()));
    }

    let launcher = find_zed_launcher().ok_or_else(|| "Zed was not found".to_string())?;

    Command::new(&launcher)
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|err| format!("Could not launch Zed ({launcher:?}): {err}"))
}

pub fn system_file_explorer_label() -> &'static str {
    if cfg!(windows) {
        "Explorer"
    } else if cfg!(target_os = "macos") {
        "Finder"
    } else {
        "File manager"
    }
}

pub fn open_in_system_file_explorer(path: &Path) -> Result<(), String> {
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", path.display()));
    }

    #[cfg(windows)]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|err| format!("Could not launch Explorer: {err}"))
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|err| format!("Could not launch Finder: {err}"))
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|err| format!("Could not open file manager: {err}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn expands_home_path() {
        let home = user_home().expect("home");
        assert_eq!(expand_path("~").unwrap(), home);
    }

    #[test]
    fn skips_heavy_directories() {
        assert!(should_skip_dir("node_modules"));
        assert!(should_skip_dir("Node_Modules"));
        assert!(should_skip_dir(".git"));
        assert!(!should_skip_dir("src"));
    }

    #[test]
    fn list_solution_files_returns_only_sln_and_slnx() {
        let temp = std::env::temp_dir().join(format!("oterm_fs_test_{}", std::process::id()));
        fs::create_dir_all(&temp).expect("temp dir");
        fs::write(temp.join("App.sln"), "fake").expect("write sln");
        fs::write(temp.join("App.slnx"), "fake").expect("write slnx");
        fs::write(temp.join("readme.txt"), "fake").expect("write txt");

        let solutions = list_solution_files(&temp).expect("list solutions");
        assert_eq!(solutions.len(), 2);
        assert!(solutions.iter().all(|path| is_solution_file(path)));

        fs::remove_dir_all(&temp).expect("cleanup");
    }

    #[test]
    fn find_env_import_hint_skips_when_current_has_env() {
        let temp = std::env::temp_dir().join(format!("oterm_env_test_{}", std::process::id()));
        fs::create_dir_all(&temp).expect("temp dir");
        fs::write(temp.join(".env"), "KEY=1").expect("write env");

        assert!(find_env_import_hint(&temp).is_none());

        fs::remove_dir_all(&temp).expect("cleanup");
    }

    #[test]
    fn find_env_import_hint_finds_parent_env() {
        let temp = std::env::temp_dir().join(format!("oterm_env_parent_{}", std::process::id()));
        let child = temp.join("child");
        fs::create_dir_all(&child).expect("child dir");
        fs::write(temp.join(".env"), "KEY=1").expect("write parent env");

        let hint = find_env_import_hint(&child).expect("hint");
        assert_eq!(hint.0, temp.join(".env"));
        assert_eq!(hint.1, child.join(".env"));

        fs::remove_dir_all(&temp).expect("cleanup");
    }

    #[test]
    fn find_env_import_hint_finds_deep_ancestor_env() {
        let temp = std::env::temp_dir().join(format!("oterm_env_deep_{}", std::process::id()));
        let deep = temp.join("a").join("b").join("c");
        fs::create_dir_all(&deep).expect("deep dir");
        fs::write(temp.join(".env"), "KEY=1").expect("write root env");

        let hint = find_env_import_hint(&deep).expect("hint");
        assert_eq!(hint.0, temp.join(".env"));
        assert_eq!(hint.1, deep.join(".env"));

        fs::remove_dir_all(&temp).expect("cleanup");
    }

    #[test]
    fn find_env_import_hint_none_when_missing() {
        let temp = std::env::temp_dir().join(format!("oterm_env_none_{}", std::process::id()));
        let child = temp.join("child");
        fs::create_dir_all(&child).expect("child dir");

        assert!(find_env_import_hint(&child).is_none());

        fs::remove_dir_all(&temp).expect("cleanup");
    }

    #[test]
    fn cleanup_old_composer_attachments_keeps_recent_files() {
        let temp = std::env::temp_dir().join(format!("oterm_attach_recent_{}", std::process::id()));
        fs::create_dir_all(&temp).expect("temp dir");
        let file = temp.join("recent.png");
        fs::write(&file, b"png").expect("write file");

        let deleted =
            cleanup_old_composer_attachments_in(&temp, Duration::from_secs(7 * 24 * 60 * 60))
                .expect("cleanup");
        assert_eq!(deleted, 0);
        assert!(file.is_file());

        fs::remove_dir_all(&temp).expect("cleanup");
    }

    #[test]
    fn cleanup_old_composer_attachments_removes_stale_files() {
        let temp = std::env::temp_dir().join(format!("oterm_attach_stale_{}", std::process::id()));
        fs::create_dir_all(&temp).expect("temp dir");
        let file = temp.join("stale.png");
        fs::write(&file, b"png").expect("write file");
        std::thread::sleep(Duration::from_millis(20));

        let deleted =
            cleanup_old_composer_attachments_in(&temp, Duration::from_secs(0)).expect("cleanup");
        assert_eq!(deleted, 1);
        assert!(!file.exists());

        fs::remove_dir_all(&temp).expect("cleanup");
    }

    #[test]
    fn cleanup_old_composer_attachments_noops_when_dir_missing() {
        let temp =
            std::env::temp_dir().join(format!("oterm_attach_missing_{}", std::process::id()));
        let deleted =
            cleanup_old_composer_attachments_in(&temp, Duration::from_secs(7 * 24 * 60 * 60))
                .expect("cleanup");
        assert_eq!(deleted, 0);
    }
}
