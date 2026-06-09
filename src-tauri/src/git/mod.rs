pub mod branches;
pub mod commands;
pub mod issues;
pub mod pr;

use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub is_repo: bool,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub changed_files: u32,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileEntry {
    pub path: String,
    pub status: String,
    pub staged: bool,
    pub untracked: bool,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSourceControlStatus {
    pub is_repo: bool,
    pub repo_root: Option<String>,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub changed_files: u32,
    pub additions: u32,
    pub deletions: u32,
    pub staged: Vec<GitFileEntry>,
    pub changes: Vec<GitFileEntry>,
    pub untracked: Vec<GitFileEntry>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitEntry {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
    pub author: String,
    pub date: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileDiff {
    pub path: String,
    pub staged: bool,
    pub untracked: bool,
    pub content: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStagedDiffContext {
    pub stat: String,
    pub diff: String,
    pub truncated: bool,
}

const STAGED_DIFF_MAX_BYTES: usize = 12_000;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorkingFile {
    pub content: String,
    pub exists: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchList {
    pub current: Option<String>,
    pub local: Vec<String>,
    pub remote: Vec<String>,
}

pub fn resolve_git_status(path: Option<String>) -> Result<GitStatus, String> {
    let cwd = resolve_cwd(path)?;
    Ok(read_git_status(&cwd))
}

pub fn resolve_source_control(path: Option<String>) -> Result<GitSourceControlStatus, String> {
    let cwd = resolve_cwd(path)?;
    Ok(read_source_control(&cwd))
}

pub fn stage_paths(repo_root: String, paths: Vec<String>) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["add", "--"];
    for path in &paths {
        args.push(path.as_str());
    }
    git_run(&root, &args)
}

pub fn unstage_paths(repo_root: String, paths: Vec<String>) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["restore", "--staged", "--"];
    for path in &paths {
        args.push(path.as_str());
    }
    git_run(&root, &args)
}

pub fn revert_tracked_paths(repo_root: String, paths: Vec<String>) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["restore", "--staged", "--worktree", "--"];
    for path in &paths {
        args.push(path.as_str());
    }
    git_run(&root, &args)
}

pub fn revert_untracked_paths(repo_root: String, paths: Vec<String>) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["clean", "-f", "--"];
    for path in &paths {
        args.push(path.as_str());
    }
    git_run(&root, &args)
}

fn apply_hunk_patch(
    repo_root: &Path,
    path: &str,
    hunk_patch: &str,
    extra_args: &[&str],
) -> Result<(), String> {
    if hunk_patch.trim().is_empty() {
        return Err("Hunk patch is empty".into());
    }

    let normalized = path.replace('\\', "/");
    let patch_path = format!("a/{normalized}");
    if !hunk_patch.contains(&format!("--- {patch_path}"))
        && !hunk_patch.contains(&format!("--- a/{path}"))
    {
        return Err(format!("Patch does not match file: {path}"));
    }

    let mut cmd = Command::new("git");
    cmd.current_dir(repo_root);
    cmd.args(["apply", "-p1", "--recount", "--unidiff-zero", "--whitespace=nowarn"]);
    cmd.args(extra_args);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|err| err.to_string())?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(hunk_patch.as_bytes())
            .map_err(|err| err.to_string())?;
    }

    let output = child.wait_with_output().map_err(|err| err.to_string())?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    if stderr.trim().is_empty() {
        Err("Failed to apply hunk patch".into())
    } else {
        Err(stderr)
    }
}

pub fn revert_hunk(
    repo_root: String,
    path: String,
    hunk_patch: String,
    staged: bool,
) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    if staged {
        apply_hunk_patch(&root, &path, &hunk_patch, &["-R", "--cached"])
    } else {
        apply_hunk_patch(&root, &path, &hunk_patch, &["-R"])
    }
}

pub fn stage_hunk(repo_root: String, path: String, hunk_patch: String) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    apply_hunk_patch(&root, &path, &hunk_patch, &["--cached"])
}

pub fn unstage_hunk(repo_root: String, path: String, hunk_patch: String) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    apply_hunk_patch(&root, &path, &hunk_patch, &["-R", "--cached"])
}

pub fn commit_changes(repo_root: String, message: String) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err("Commit message is required".into());
    }
    git_run(&root, &["commit", "-m", trimmed])
}

pub fn resolve_staged_diff(repo_root: String) -> Result<GitStagedDiffContext, String> {
    let root = PathBuf::from(repo_root);
    if !root.is_dir() {
        return Err("Repository root does not exist".into());
    }
    read_staged_diff_context(&root, STAGED_DIFF_MAX_BYTES)
}

pub fn push_changes(repo_root: String) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    if !root.is_dir() {
        return Err("Repository root does not exist".into());
    }

    let has_upstream = git_output(&root, &["rev-parse", "--abbrev-ref", "@{upstream}"]).is_ok();
    if has_upstream {
        return git_run(&root, &["push"]);
    }

    let branch = git_output(&root, &["branch", "--show-current"])?
        .trim()
        .to_string();
    if branch.is_empty() {
        return Err("Cannot push: detached HEAD".into());
    }

    git_run(&root, &["push", "-u", "origin", &branch])
}

pub fn fetch_changes(repo_root: String) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    if !root.is_dir() {
        return Err("Repository root does not exist".into());
    }
    git_run(&root, &["fetch", "--all", "--prune"])
}

enum PullMode {
    FastForwardOnly,
    Rebase,
}

pub fn pull_changes(repo_root: String) -> Result<(), String> {
    pull_with_mode(repo_root, PullMode::FastForwardOnly)
}

pub fn sync_changes(repo_root: String) -> Result<(), String> {
    pull_with_mode(repo_root.clone(), PullMode::Rebase)?;
    push_changes(repo_root)
}

fn pull_with_mode(repo_root: String, mode: PullMode) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    if !root.is_dir() {
        return Err("Repository root does not exist".into());
    }

    let has_upstream = git_output(&root, &["rev-parse", "--abbrev-ref", "@{upstream}"]).is_ok();
    match mode {
        PullMode::FastForwardOnly if has_upstream => git_run(&root, &["pull", "--ff-only"]),
        PullMode::Rebase if has_upstream => git_run(&root, &["pull", "--rebase", "--autostash"]),
        _ => {
            let branch = git_output(&root, &["branch", "--show-current"])?
                .trim()
                .to_string();
            if branch.is_empty() {
                return Err("Cannot pull: detached HEAD".into());
            }
            match mode {
                PullMode::FastForwardOnly => {
                    git_run(&root, &["pull", "--ff-only", "origin", &branch])
                }
                PullMode::Rebase => {
                    git_run(&root, &["pull", "--rebase", "--autostash", "origin", &branch])
                }
            }
        }
    }
}

pub fn list_branches(repo_root: String) -> Result<GitBranchList, String> {
    let root = PathBuf::from(repo_root);
    if !root.is_dir() {
        return Err("Repository root does not exist".into());
    }

    let current = git_output(&root, &["branch", "--show-current"])
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let local = list_ref_names(&root, "refs/heads/")?;
    let mut remote = list_ref_names(&root, "refs/remotes/")?;
    remote.retain(|name| !name.ends_with("/HEAD"));

    Ok(GitBranchList {
        current,
        local,
        remote,
    })
}

pub fn checkout_branch(repo_root: String, branch: String, is_remote: bool) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    if !root.is_dir() {
        return Err("Repository root does not exist".into());
    }

    let trimmed = branch.trim();
    if trimmed.is_empty() {
        return Err("Branch name is required".into());
    }

    if is_remote {
        let Some((_, local_name)) = trimmed.split_once('/') else {
            return Err("Invalid remote branch".into());
        };
        let local_ref = format!("refs/heads/{local_name}");
        if git_output(&root, &["show-ref", "--verify", "--quiet", &local_ref]).is_ok() {
            return git_run(&root, &["switch", local_name]);
        }
        return git_run(&root, &["switch", "-c", local_name, "--track", trimmed]);
    }

    git_run(&root, &["switch", trimmed])
}

fn list_ref_names(repo_root: &Path, prefix: &str) -> Result<Vec<String>, String> {
    let output = git_output(
        repo_root,
        &[
            "for-each-ref",
            "--format=%(refname:short)",
            "--sort=refname",
            prefix,
        ],
    )?;

    Ok(output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

pub fn resolve_file_diff(
    repo_root: String,
    path: String,
    staged: bool,
    untracked: bool,
) -> Result<GitFileDiff, String> {
    let root = PathBuf::from(&repo_root);
    if !root.is_dir() {
        return Err("Repository root does not exist".into());
    }
    read_file_diff(&root, &path, staged, untracked)
}

pub fn resolve_read_working_file(repo_root: String, path: String) -> Result<GitWorkingFile, String> {
    let root = PathBuf::from(&repo_root);
    if !root.is_dir() {
        return Err("Repository root does not exist".into());
    }
    read_working_file(&root, &path)
}

pub fn resolve_write_working_file(
    repo_root: String,
    path: String,
    content: String,
) -> Result<(), String> {
    let root = PathBuf::from(&repo_root);
    if !root.is_dir() {
        return Err("Repository root does not exist".into());
    }
    write_working_file(&root, &path, &content)
}

pub fn read_log(repo_root: String, limit: u32) -> Result<Vec<GitCommitEntry>, String> {
    let root = PathBuf::from(repo_root);
    let count = limit.clamp(1, 100);
    let output = git_output(
        &root,
        &[
            "log",
            &format!("-n{count}"),
            "--pretty=format:%H|%h|%s|%an|%ai",
        ],
    )?;

    let commits = output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(parse_commit_line)
        .collect();

    Ok(commits)
}

fn resolve_cwd(path: Option<String>) -> Result<PathBuf, String> {
    match path {
        Some(value) => crate::fs::expand_path(&value),
        None => crate::fs::default_project_root(),
    }
}

pub(crate) fn read_git_status(cwd: &Path) -> GitStatus {
    let sc = read_source_control(cwd);
    GitStatus {
        is_repo: sc.is_repo,
        branch: sc.branch,
        upstream: sc.upstream,
        ahead: sc.ahead,
        behind: sc.behind,
        changed_files: sc.changed_files,
        additions: sc.additions,
        deletions: sc.deletions,
    }
}

pub(crate) fn read_source_control(cwd: &Path) -> GitSourceControlStatus {
    if !cwd.is_dir() {
        return GitSourceControlStatus::empty();
    }

    let Some(repo_root) = find_git_root(cwd.to_path_buf()) else {
        return GitSourceControlStatus::empty();
    };

    let branch = git_output(&repo_root, &["branch", "--show-current"])
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let (mut staged, mut changes, mut untracked) = parse_porcelain_status(&repo_root);
    apply_file_stats(&repo_root, &mut staged, &mut changes, &mut untracked);
    let changed_files = (staged.len() + changes.len() + untracked.len()) as u32;
    let (additions, deletions) = diff_stats(&repo_root);
    let (upstream, ahead, behind) = tracking_counts(&repo_root);

    GitSourceControlStatus {
        is_repo: true,
        repo_root: Some(repo_root.to_string_lossy().into_owned()),
        branch,
        upstream,
        ahead,
        behind,
        changed_files,
        additions,
        deletions,
        staged,
        changes,
        untracked,
    }
}

fn tracking_counts(repo_root: &Path) -> (Option<String>, u32, u32) {
    let Ok(output) = git_output(repo_root, &["status", "-sb"]) else {
        return (None, 0, 0);
    };
    let header = match output.lines().next() {
        Some(line) if line.starts_with("## ") => &line[3..],
        _ => return (None, 0, 0),
    };
    parse_tracking_header(header)
}

fn parse_tracking_header(header: &str) -> (Option<String>, u32, u32) {
    let (name_part, bracket) = match header.find(" [") {
        Some(idx) => (&header[..idx], Some(&header[idx + 2..])),
        None => (header, None),
    };

    let upstream = name_part
        .split_once("...")
        .map(|(_, remote)| remote.trim().to_string())
        .filter(|value| !value.is_empty());

    let mut ahead = 0u32;
    let mut behind = 0u32;
    if let Some(inner) = bracket.and_then(|value| value.strip_suffix(']')) {
        for segment in inner.split(',') {
            let segment = segment.trim();
            if let Some(count) = segment.strip_prefix("ahead ") {
                ahead = count.trim().parse().unwrap_or(0);
            } else if let Some(count) = segment.strip_prefix("behind ") {
                behind = count.trim().parse().unwrap_or(0);
            }
        }
    }

    (upstream, ahead, behind)
}

fn parse_porcelain_status(repo_root: &Path) -> (Vec<GitFileEntry>, Vec<GitFileEntry>, Vec<GitFileEntry>) {
    let Ok(output) = git_output(repo_root, &["status", "--porcelain", "-z", "-uall"]) else {
        return (vec![], vec![], vec![]);
    };

    let mut staged = Vec::new();
    let mut changes = Vec::new();
    let mut untracked = Vec::new();

    for entry in output.split('\0').filter(|part| !part.is_empty()) {
        if entry.len() < 3 {
            continue;
        }

        let index_status = entry.as_bytes().first().copied().unwrap_or(b' ');
        let worktree_status = entry.as_bytes().get(1).copied().unwrap_or(b' ');
        let path = entry[3..].to_string();

        if index_status == b'?' && worktree_status == b'?' {
            untracked.push(GitFileEntry {
                path: path.clone(),
                status: "??".into(),
                staged: false,
                untracked: true,
                additions: 0,
                deletions: 0,
            });
            continue;
        }

        if index_status != b' ' && index_status != b'?' {
            staged.push(GitFileEntry {
                path: path.clone(),
                status: status_label(index_status, worktree_status, true),
                staged: true,
                untracked: false,
                additions: 0,
                deletions: 0,
            });
        }

        if worktree_status != b' ' && worktree_status != b'?' {
            changes.push(GitFileEntry {
                path,
                status: status_label(index_status, worktree_status, false),
                staged: false,
                untracked: false,
                additions: 0,
                deletions: 0,
            });
        }
    }

    (staged, changes, untracked)
}

fn status_label(index: u8, worktree: u8, staged: bool) -> String {
    let code = if staged { index } else { worktree };
    match code as char {
        'M' => "M".into(),
        'A' => "A".into(),
        'D' => "D".into(),
        'R' => "R".into(),
        'C' => "C".into(),
        'U' => "U".into(),
        'T' => "T".into(),
        _ => format!("{index}{worktree}"),
    }
}

fn parse_commit_line(line: &str) -> Option<GitCommitEntry> {
    let mut parts = line.splitn(5, '|');
    let hash = parts.next()?.to_string();
    let short_hash = parts.next()?.to_string();
    let subject = parts.next()?.to_string();
    let author = parts.next()?.to_string();
    let date = parts.next()?.to_string();
    Some(GitCommitEntry {
        hash,
        short_hash,
        subject,
        author,
        date,
    })
}

pub(crate) fn find_git_root(mut current: PathBuf) -> Option<PathBuf> {
    loop {
        if current.join(".git").exists() {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
}

fn resolve_repo_path(repo_root: &Path, path: &str) -> Result<PathBuf, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("Path is required".into());
    }

    let relative = Path::new(path);
    if relative.is_absolute() {
        return Err("Invalid path".into());
    }

    for component in relative.components() {
        use std::path::Component;
        if matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        ) {
            return Err("Invalid path".into());
        }
    }

    Ok(repo_root.join(relative))
}

pub(crate) fn read_working_file(repo_root: &Path, path: &str) -> Result<GitWorkingFile, String> {
    let file_path = resolve_repo_path(repo_root, path)?;
    if !file_path.is_file() {
        return Ok(GitWorkingFile {
            content: String::new(),
            exists: false,
        });
    }
    let content = std::fs::read_to_string(&file_path).map_err(|err| err.to_string())?;
    Ok(GitWorkingFile {
        content,
        exists: true,
    })
}

pub(crate) fn write_working_file(
    repo_root: &Path,
    path: &str,
    content: &str,
) -> Result<(), String> {
    let file_path = resolve_repo_path(repo_root, path)?;
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    std::fs::write(&file_path, content.as_bytes()).map_err(|err| err.to_string())
}

pub(crate) fn read_staged_diff_context(
    repo_root: &Path,
    max_bytes: usize,
) -> Result<GitStagedDiffContext, String> {
    let stat = git_output(repo_root, &["diff", "--cached", "--stat"]).unwrap_or_default();
    let mut diff = git_diff_output(repo_root, &["diff", "--cached", "-U3"]).unwrap_or_default();
    let truncated = diff.len() > max_bytes;
    if truncated {
        diff.truncate(max_bytes);
        diff.push_str("\n\n... (diff truncated for LM context)");
    }
    Ok(GitStagedDiffContext {
        stat,
        diff,
        truncated,
    })
}

pub(crate) fn read_file_diff(
    repo_root: &Path,
    path: &str,
    staged: bool,
    untracked: bool,
) -> Result<GitFileDiff, String> {
    let content = if untracked {
        let file_path = repo_root.join(path);
        if !file_path.is_file() {
            return Ok(GitFileDiff {
                path: path.into(),
                staged,
                untracked,
                content: String::new(),
            });
        }
        let null_device = if cfg!(windows) { "NUL" } else { "/dev/null" };
        git_diff_output(
            repo_root,
            &["diff", "--no-index", "-U3", null_device, path],
        )
        .unwrap_or_default()
    } else if staged {
        git_diff_output(repo_root, &["diff", "--cached", "-U3", "--", path]).unwrap_or_default()
    } else {
        git_diff_output(repo_root, &["diff", "-U3", "--", path]).unwrap_or_default()
    };

    Ok(GitFileDiff {
        path: path.into(),
        staged,
        untracked,
        content,
    })
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
            if let Some((add, del)) = parse_numstat_counts(line) {
                additions += add;
                deletions += del;
            }
        }
    }

    (additions, deletions)
}

fn parse_numstat_counts(line: &str) -> Option<(u32, u32)> {
    let mut parts = line.split('\t');
    let add = parts.next()?.parse::<u32>().ok()?;
    let del = parts.next()?.parse::<u32>().ok()?;
    Some((add, del))
}

fn normalize_numstat_path(path: &str) -> String {
    path.rsplit(" => ")
        .next()
        .unwrap_or(path)
        .to_string()
}

fn numstat_map(repo_root: &Path, args: &[&str]) -> HashMap<String, (u32, u32)> {
    let Ok(output) = git_output(repo_root, args) else {
        return HashMap::new();
    };

    let mut map = HashMap::new();
    for line in output.lines() {
        let mut parts = line.split('\t');
        let Some(add_raw) = parts.next() else { continue };
        let Some(del_raw) = parts.next() else { continue };
        let Some(path_raw) = parts.next() else { continue };
        let Ok(additions) = add_raw.parse::<u32>() else { continue };
        let Ok(deletions) = del_raw.parse::<u32>() else { continue };
        let path = normalize_numstat_path(path_raw);
        map.insert(path, (additions, deletions));
    }
    map
}

fn lookup_file_stats(map: &HashMap<String, (u32, u32)>, path: &str) -> (u32, u32) {
    if let Some(stats) = map.get(path) {
        return *stats;
    }
    for (key, stats) in map {
        if path.ends_with(key.as_str()) || key.ends_with(path) {
            return *stats;
        }
    }
    (0, 0)
}

fn untracked_line_stats(repo_root: &Path, path: &str) -> (u32, u32) {
    let file_path = repo_root.join(path);
    let Ok(content) = std::fs::read_to_string(&file_path) else {
        return (0, 0);
    };
    let lines = content.lines().count() as u32;
    (lines, 0)
}

fn apply_file_stats(
    repo_root: &Path,
    staged: &mut [GitFileEntry],
    changes: &mut [GitFileEntry],
    untracked: &mut [GitFileEntry],
) {
    let staged_stats = numstat_map(repo_root, &["diff", "--cached", "--numstat"]);
    let unstaged_stats = numstat_map(repo_root, &["diff", "--numstat"]);

    for entry in staged.iter_mut() {
        let (additions, deletions) = lookup_file_stats(&staged_stats, &entry.path);
        entry.additions = additions;
        entry.deletions = deletions;
    }

    for entry in changes.iter_mut() {
        let (additions, deletions) = lookup_file_stats(&unstaged_stats, &entry.path);
        entry.additions = additions;
        entry.deletions = deletions;
    }

    for entry in untracked.iter_mut() {
        let (additions, deletions) = untracked_line_stats(repo_root, &entry.path);
        entry.additions = additions;
        entry.deletions = deletions;
    }
}

pub(crate) fn git_output(cwd: &Path, args: &[&str]) -> Result<String, String> {
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

pub(crate) fn git_diff_output(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|err| err.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    if output.status.success() || output.status.code() == Some(1) {
        return Ok(stdout);
    }

    Err(String::from_utf8_lossy(&output.stderr).into_owned())
}

pub(crate) fn git_run(cwd: &Path, args: &[&str]) -> Result<(), String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|err| err.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    Ok(())
}

impl GitSourceControlStatus {
    fn empty() -> Self {
        Self {
            is_repo: false,
            repo_root: None,
            branch: None,
            upstream: None,
            ahead: 0,
            behind: 0,
            changed_files: 0,
            additions: 0,
            deletions: 0,
            staged: vec![],
            changes: vec![],
            untracked: vec![],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn reads_repo_status_for_project_root() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let project_root = manifest.parent().expect("project root");
        let status = read_git_status(project_root);
        assert!(status.is_repo);
    }

    #[test]
    fn source_control_includes_repo_root() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let project_root = manifest.parent().expect("project root");
        let status = read_source_control(project_root);
        assert!(status.is_repo);
        assert!(status.repo_root.is_some());
    }

    #[test]
    fn read_file_diff_shows_staged_content() {
        use std::fs;

        let dir = std::env::temp_dir().join(format!("oterm-git-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        git_run(&dir, &["init"]).unwrap();
        git_run(&dir, &["config", "user.email", "t@example.com"]).unwrap();
        git_run(&dir, &["config", "user.name", "test"]).unwrap();
        fs::write(dir.join("a.txt"), "hello").unwrap();
        git_run(&dir, &["add", "a.txt"]).unwrap();
        git_run(&dir, &["commit", "-m", "init"]).unwrap();
        fs::write(dir.join("a.txt"), "hello world").unwrap();
        git_run(&dir, &["add", "a.txt"]).unwrap();

        let diff = read_file_diff(&dir, "a.txt", true, false).expect("staged diff");
        assert!(diff.content.contains("+++"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn parses_branch_tracking_header() {
        assert_eq!(
            parse_tracking_header("main...origin/main [ahead 2]"),
            (Some("origin/main".into()), 2, 0)
        );
        assert_eq!(
            parse_tracking_header("main...origin/main [ahead 2, behind 1]"),
            (Some("origin/main".into()), 2, 1)
        );
        assert_eq!(parse_tracking_header("main"), (None, 0, 0));
    }

    #[test]
    fn apply_hunk_stage_and_revert() {
        use std::fs;

        let dir = std::env::temp_dir().join(format!("oterm-hunk-apply-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        git_run(&dir, &["init"]).unwrap();
        git_run(&dir, &["config", "user.email", "t@example.com"]).unwrap();
        git_run(&dir, &["config", "user.name", "test"]).unwrap();
        fs::write(dir.join("a.txt"), "line1\nline2\nline3\n").unwrap();
        git_run(&dir, &["add", "a.txt"]).unwrap();
        git_run(&dir, &["commit", "-m", "init"]).unwrap();
        fs::write(dir.join("a.txt"), "line1\nline2changed\nline3\n").unwrap();

        let diff = read_file_diff(&dir, "a.txt", false, false).expect("diff");
        let patch = diff.content;
        assert!(patch.contains("--- a/a.txt"));

        stage_hunk(
            dir.to_string_lossy().into_owned(),
            "a.txt".into(),
            patch.clone(),
        )
        .expect("stage hunk");

        let staged = read_file_diff(&dir, "a.txt", true, false).expect("staged diff");
        assert!(staged.content.contains("line2changed"));

        revert_hunk(
            dir.to_string_lossy().into_owned(),
            "a.txt".into(),
            patch,
            false,
        )
        .expect("revert working hunk");

        let content = fs::read_to_string(dir.join("a.txt")).unwrap();
        assert_eq!(content.replace("\r\n", "\n"), "line1\nline2\nline3\n");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_write_working_file_roundtrip() {
        use std::fs;

        let dir = std::env::temp_dir().join(format!("oterm-git-write-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        git_run(&dir, &["init"]).unwrap();

        write_working_file(&dir, "nested/a.txt", "first").expect("write");
        let first = read_working_file(&dir, "nested/a.txt").expect("read");
        assert!(first.exists);
        assert_eq!(first.content, "first");

        write_working_file(&dir, "nested/a.txt", "second").expect("rewrite");
        let second = read_working_file(&dir, "nested/a.txt").expect("read");
        assert!(second.exists);
        assert_eq!(second.content, "second");

        let _ = fs::remove_dir_all(&dir);
    }
}
