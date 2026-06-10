use std::cmp::Ordering;
use std::path::PathBuf;

use super::{git_diff_output, git_output, git_run, GitCommitEntry};

pub(crate) fn branch_sort_key(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .filter(|c| !matches!(c, '-' | '_' | '.' | ' ' | '\t'))
        .collect()
}

pub(crate) fn compare_branch_names(a: &str, b: &str) -> Ordering {
    branch_sort_key(a)
        .cmp(&branch_sort_key(b))
        .then_with(|| a.to_lowercase().cmp(&b.to_lowercase()))
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchRefInfo {
    pub name: String,
    pub short_hash: String,
    pub is_remote: bool,
    pub is_current: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub remote_name: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphCommit {
    pub hash: String,
    pub short_hash: String,
    pub parents: Vec<String>,
    pub subject: String,
    pub author: String,
    pub date: String,
    pub decorations: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitGraphPage {
    pub commits: Vec<GraphCommit>,
    pub has_more: bool,
    pub next_skip: u32,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetails {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
    pub body: String,
    pub author: String,
    pub author_email: String,
    pub date: String,
    pub parents: Vec<String>,
    pub diff: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareResult {
    pub base: String,
    pub target: String,
    pub content: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeInfo {
    pub path: String,
    pub branch: Option<String>,
    pub head: String,
    pub is_main: bool,
}

pub fn list_worktrees(repo_root: String) -> Result<Vec<GitWorktreeInfo>, String> {
    let root = PathBuf::from(&repo_root);
    if !root.is_dir() {
        return Err("Repository root does not exist".into());
    }

    let output = git_output(&root, &["worktree", "list", "--porcelain"])?;

    let mut worktrees = Vec::new();
    let mut path: Option<String> = None;
    let mut head: Option<String> = None;
    let mut branch: Option<String> = None;

    let flush = |path: &mut Option<String>,
                     head: &mut Option<String>,
                     branch: &mut Option<String>,
                     worktrees: &mut Vec<GitWorktreeInfo>| {
        let Some(wt_path) = path.take() else {
            head.take();
            branch.take();
            return;
        };
        let Some(wt_head) = head.take() else {
            branch.take();
            return;
        };
        let wt_branch = branch.take();
        let is_main = PathBuf::from(&wt_path).join(".git").is_dir();
        worktrees.push(GitWorktreeInfo {
            path: wt_path,
            branch: wt_branch,
            head: wt_head,
            is_main,
        });
    };

    for line in output.lines() {
        if let Some(rest) = line.strip_prefix("worktree ") {
            flush(&mut path, &mut head, &mut branch, &mut worktrees);
            path = Some(rest.to_string());
            continue;
        }
        if let Some(rest) = line.strip_prefix("HEAD ") {
            head = Some(rest.to_string());
            continue;
        }
        if let Some(rest) = line.strip_prefix("branch ") {
            branch = rest
                .strip_prefix("refs/heads/")
                .map(|name| name.to_string());
            continue;
        }
        if line == "detached" {
            branch = None;
        }
    }

    flush(&mut path, &mut head, &mut branch, &mut worktrees);

    Ok(worktrees)
}

pub fn list_branch_refs(repo_root: String) -> Result<Vec<BranchRefInfo>, String> {
    let root = PathBuf::from(&repo_root);
    let current = git_output(&root, &["branch", "--show-current"])
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());

    let output = git_output(
        &root,
        &[
            "for-each-ref",
            "--format=%(refname)|%(refname:short)|%(objectname:short)|%(upstream:short)|%(upstream:track)",
            "refs/heads/",
            "refs/remotes/",
        ],
    )?;

    let mut refs = Vec::new();
    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split('|');
        let refname = parts.next().unwrap_or("");
        let name = parts.next().unwrap_or("").to_string();
        if name.is_empty() || name.ends_with("/HEAD") {
            continue;
        }
        let short_hash = parts.next().unwrap_or("").to_string();
        let upstream = parts
            .next()
            .filter(|v| !v.is_empty())
            .map(str::to_string);
        let track = parts.next().unwrap_or("");
        let (ahead, behind) = parse_track(track);
        let is_remote = refname.starts_with("refs/remotes/");
        let remote_name = is_remote
            .then(|| name.split_once('/').map(|(remote, _)| remote.to_string()))
            .flatten();
        let is_current = !is_remote && current.as_deref() == Some(name.as_str());

        refs.push(BranchRefInfo {
            name,
            short_hash,
            is_remote,
            is_current,
            upstream,
            ahead,
            behind,
            remote_name,
        });
    }

    refs.sort_by(|a, b| compare_branch_names(&a.name, &b.name));
    Ok(refs)
}

pub fn read_commit_graph(
    repo_root: String,
    limit: u32,
    skip: u32,
    scope: &str,
) -> Result<CommitGraphPage, String> {
    let root = PathBuf::from(&repo_root);
    let count = limit.clamp(1, 500);
    let pretty = "--pretty=format:%H|%P|%h|%s|%an|%ai|%d";

    let mut args: Vec<String> = vec![
        "log".into(),
        "--topo-order".into(),
        format!("-n{count}"),
        format!("--skip={skip}"),
        pretty.into(),
    ];

    if scope == "all" {
        args.insert(1, "--all".into());
    } else {
        args.push("HEAD".into());
    }

    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = git_output(&root, &arg_refs)?;

    let raw_line_count = output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count() as u32;
    let commits = dedupe_graph_commits(
        output
            .lines()
            .filter(|line| !line.trim().is_empty())
            .filter_map(parse_graph_line)
            .collect(),
    );

    Ok(CommitGraphPage {
        has_more: raw_line_count >= count,
        next_skip: skip.saturating_add(raw_line_count),
        commits,
    })
}

fn dedupe_graph_commits(commits: Vec<GraphCommit>) -> Vec<GraphCommit> {
    let mut seen = std::collections::HashSet::new();
    commits
        .into_iter()
        .filter(|commit| seen.insert(commit.hash.clone()))
        .collect()
}

pub fn read_commit_details(repo_root: String, hash: String) -> Result<CommitDetails, String> {
    let root = PathBuf::from(&repo_root);
    let trimmed = hash.trim();
    if trimmed.is_empty() {
        return Err("Commit hash is required".into());
    }

    let meta = git_output(
        &root,
        &[
            "show",
            "-s",
            "--format=%H|%h|%s|%b---BODY---|%an|%ae|%ai|%P",
            trimmed,
        ],
    )?;
    let line = meta.lines().next().ok_or("Commit not found")?;
    let mut parts = line.splitn(8, '|');
    let hash = parts.next().unwrap_or("").to_string();
    let short_hash = parts.next().unwrap_or("").to_string();
    let subject = parts.next().unwrap_or("").to_string();
    let body = parts
        .next()
        .unwrap_or("")
        .replace("---BODY---", "")
        .trim()
        .to_string();
    let author = parts.next().unwrap_or("").to_string();
    let author_email = parts.next().unwrap_or("").to_string();
    let date = parts.next().unwrap_or("").to_string();
    let parents_raw = parts.next().unwrap_or("");
    let parents = parents_raw
        .split_whitespace()
        .map(str::to_string)
        .filter(|p| !p.is_empty())
        .collect();

    let diff = git_diff_output(&root, &["show", "--stat", "--patch", trimmed])
        .unwrap_or_default();

    Ok(CommitDetails {
        hash,
        short_hash,
        subject,
        body,
        author,
        author_email,
        date,
        parents,
        diff,
    })
}

pub fn compare_commits(
    repo_root: String,
    base: String,
    target: String,
) -> Result<CompareResult, String> {
    let root = PathBuf::from(&repo_root);
    let base = base.trim().to_string();
    let target = target.trim().to_string();
    if base.is_empty() || target.is_empty() {
        return Err("Base and target are required".into());
    }
    let range = format!("{base}..{target}");
    let content = git_diff_output(&root, &["diff", "-U3", &range]).unwrap_or_default();
    Ok(CompareResult {
        base,
        target,
        content,
    })
}

pub fn list_incoming_outgoing(
    repo_root: String,
    direction: String,
) -> Result<Vec<GitCommitEntry>, String> {
    let root = PathBuf::from(&repo_root);
    let has_upstream = git_output(&root, &["rev-parse", "--abbrev-ref", "@{upstream}"]).is_ok();
    if !has_upstream {
        return Err("No upstream configured for current branch".into());
    }

    let range = match direction.as_str() {
        "incoming" => "HEAD..@{upstream}",
        "outgoing" => "@{upstream}..HEAD",
        _ => return Err("Direction must be incoming or outgoing".into()),
    };

    let output = git_output(
        &root,
        &["log", range, "--pretty=format:%H|%h|%s|%an|%ai"],
    )?;

    Ok(output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let mut parts = line.splitn(5, '|');
            Some(GitCommitEntry {
                hash: parts.next()?.to_string(),
                short_hash: parts.next()?.to_string(),
                subject: parts.next()?.to_string(),
                author: parts.next()?.to_string(),
                date: parts.next()?.to_string(),
            })
        })
        .collect())
}

pub fn checkout_detached(repo_root: String, hash: String) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    git_run(&root, &["switch", "--detach", hash.trim()])
}

pub fn create_branch(
    repo_root: String,
    name: String,
    start_point: Option<String>,
) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    let name = name.trim();
    if name.is_empty() {
        return Err("Branch name is required".into());
    }
    match start_point.filter(|s| !s.trim().is_empty()) {
        Some(start) => git_run(&root, &["switch", "-c", name, start.trim()]),
        None => git_run(&root, &["switch", "-c", name]),
    }
}

pub fn create_tag(
    repo_root: String,
    name: String,
    commit: Option<String>,
    message: Option<String>,
) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    let name = name.trim();
    if name.is_empty() {
        return Err("Tag name is required".into());
    }
    if let Some(msg) = message.filter(|m| !m.trim().is_empty()) {
        let mut args = vec!["tag", "-a", name, "-m", msg.trim()];
        if let Some(c) = commit.as_deref().filter(|s| !s.is_empty()) {
            args.push(c);
        }
        git_run(&root, &args)
    } else if let Some(c) = commit.as_deref().filter(|s| !s.is_empty()) {
        git_run(&root, &["tag", name, c])
    } else {
        git_run(&root, &["tag", name])
    }
}

pub fn revert_commit(repo_root: String, hash: String) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    git_run(&root, &["revert", "--no-edit", hash.trim()])
}

pub fn reset_commit(repo_root: String, hash: String, mode: String) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    let flag = match mode.as_str() {
        "hard" => "--hard",
        _ => "--mixed",
    };
    git_run(&root, &["reset", flag, hash.trim()])
}

pub fn cherry_pick_commit(repo_root: String, hash: String) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    git_run(&root, &["cherry-pick", hash.trim()])
}

pub fn delete_branch(
    repo_root: String,
    name: String,
    is_remote: bool,
    force: bool,
) -> Result<(), String> {
    let root = PathBuf::from(&repo_root);
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Branch name is required".into());
    }

    if is_remote {
        let Some((remote, branch)) = trimmed.split_once('/') else {
            return Err("Invalid remote branch name".into());
        };
        if branch.is_empty() || branch == "HEAD" {
            return Err("Cannot delete remote HEAD".into());
        }
        return git_run(&root, &["push", remote, "--delete", branch]);
    }

    let current = git_output(&root, &["branch", "--show-current"])
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
    if current.as_deref() == Some(trimmed) {
        return Err("Cannot delete the current branch".into());
    }

    let flag = if force { "-D" } else { "-d" };
    git_run(&root, &["branch", flag, trimmed])
}

pub fn merge_branch(repo_root: String, source: String, target: String) -> Result<(), String> {
    let root = PathBuf::from(&repo_root);
    let source = source.trim().to_string();
    let target = target.trim().to_string();
    if source.is_empty() || target.is_empty() {
        return Err("Source and target branches are required".into());
    }
    if source == target {
        return Err("Source and target branches must be different".into());
    }

    if is_working_tree_dirty(&root)? {
        return Err("Working tree has uncommitted changes. Commit or stash before merging.".into());
    }

    let previous = git_output(&root, &["branch", "--show-current"])
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());

    if git_run(&root, &["switch", &target]).is_err() {
        return Err(format!("Target branch '{target}' not found"));
    }

    match git_run(&root, &["merge", &source]) {
        Ok(()) => Ok(()),
        Err(err) => {
            let _ = git_run(&root, &["merge", "--abort"]);
            if let Some(prev) = previous.as_deref() {
                if prev != target {
                    let _ = git_run(&root, &["switch", prev]);
                }
            }
            Err(format!("Merge failed: {err}"))
        }
    }
}

fn is_working_tree_dirty(root: &PathBuf) -> Result<bool, String> {
    let output = git_output(root, &["status", "--porcelain"])?;
    Ok(!output.trim().is_empty())
}

pub fn squash_commits(repo_root: String, count: u32, message: String) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    if count < 2 {
        return Err("Squash requires at least 2 commits".into());
    }
    let msg = message.trim();
    if msg.is_empty() {
        return Err("Squash commit message is required".into());
    }
    let n = count.to_string();
    git_run(&root, &["reset", "--soft", &format!("HEAD~{n}")])?;
    git_run(&root, &["commit", "-m", msg])
}

fn parse_track(track: &str) -> (u32, u32) {
    let mut ahead = 0u32;
    let mut behind = 0u32;
    let inner = track.trim_start_matches('[').trim_end_matches(']');
    for part in inner.split(',') {
        let part = part.trim();
        if let Some(v) = part.strip_prefix("ahead ") {
            ahead = v.trim().parse().unwrap_or(0);
        } else if let Some(v) = part.strip_prefix("behind ") {
            behind = v.trim().parse().unwrap_or(0);
        }
    }
    (ahead, behind)
}

fn parse_graph_line(line: &str) -> Option<GraphCommit> {
    let mut parts = line.splitn(7, '|');
    let hash = parts.next()?.to_string();
    let parents_raw = parts.next().unwrap_or("");
    let short_hash = parts.next()?.to_string();
    let subject = parts.next()?.to_string();
    let author = parts.next()?.to_string();
    let date = parts.next()?.to_string();
    let decorations = parts.next().unwrap_or("").to_string();
    let parents = parents_raw
        .split_whitespace()
        .map(str::to_string)
        .filter(|p| !p.is_empty())
        .collect();
    Some(GraphCommit {
        hash,
        short_hash,
        parents,
        subject,
        author,
        date,
        decorations,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_track_string() {
        assert_eq!(parse_track("[ahead 2, behind 1]"), (2, 1));
    }

    #[test]
    fn dedupes_graph_commits_by_hash() {
        let sample = |hash: &str| GraphCommit {
            hash: hash.into(),
            short_hash: hash[..1.min(hash.len())].into(),
            parents: vec![],
            subject: "s".into(),
            author: "a".into(),
            date: "d".into(),
            decorations: String::new(),
        };
        let deduped = dedupe_graph_commits(vec![
            sample("aaa"),
            sample("aaa"),
            sample("bbb"),
        ]);
        assert_eq!(deduped.len(), 2);
        assert_eq!(deduped[0].hash, "aaa");
        assert_eq!(deduped[1].hash, "bbb");
    }
}
