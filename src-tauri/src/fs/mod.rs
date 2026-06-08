pub mod commands;
pub mod context_menu;

use std::path::{Path, PathBuf};

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

        entries.push(commands::FsEntry {
            name: item.file_name().to_string_lossy().into_owned(),
            path: entry_path.to_string_lossy().into_owned(),
            is_dir: file_type.is_dir(),
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
