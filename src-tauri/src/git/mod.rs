pub mod commands;

use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub is_repo: bool,
    pub branch: Option<String>,
    pub changed_files: u32,
    pub additions: u32,
    pub deletions: u32,
}

pub fn resolve_git_status(path: Option<String>) -> Result<GitStatus, String> {
    let cwd = match path {
        Some(value) => crate::fs::expand_path(&value)?,
        None => crate::fs::default_project_root()?,
    };
    Ok(read_git_status(&cwd))
}

pub(crate) fn read_git_status(cwd: &Path) -> GitStatus {
    if !cwd.is_dir() {
        return GitStatus::empty();
    }

    let Some(repo_root) = find_git_root(cwd.to_path_buf()) else {
        return GitStatus::empty();
    };

    let branch = git_output(&repo_root, &["branch", "--show-current"])
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let porcelain = git_output(&repo_root, &["status", "--porcelain"]).unwrap_or_default();
    let changed_files = porcelain
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count() as u32;

    let (additions, deletions) = diff_stats(&repo_root);

    GitStatus {
        is_repo: branch.is_some(),
        branch,
        changed_files,
        additions,
        deletions,
    }
}

fn find_git_root(mut current: PathBuf) -> Option<PathBuf> {
    loop {
        if current.join(".git").exists() {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
}

fn diff_stats(repo_root: &Path) -> (u32, u32) {
    let mut additions = 0u32;
    let mut deletions = 0u32;

    for args in [
        &["diff", "--numstat"] as &[&str],
        &["diff", "--cached", "--numstat"],
    ] {
        let Ok(output) = git_output(repo_root, args) else {
            continue;
        };

        for line in output.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() < 2 {
                continue;
            }
            if let Ok(value) = parts[0].parse::<u32>() {
                additions += value;
            }
            if let Ok(value) = parts[1].parse::<u32>() {
                deletions += value;
            }
        }
    }

    (additions, deletions)
}

fn git_output(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|err| err.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

impl GitStatus {
    fn empty() -> Self {
        Self {
            is_repo: false,
            branch: None,
            changed_files: 0,
            additions: 0,
            deletions: 0,
        }
    }
}
