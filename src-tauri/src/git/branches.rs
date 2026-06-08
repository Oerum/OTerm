use std::path::PathBuf;

use super::{git_diff_output, git_output, git_run, GitCommitEntry};

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
            "--format=%(refname:short)|%(objectname:short)|%(upstream:short)|%(upstream:track)",
            "refs/heads/",
            "refs/remotes/",
        ],
    )?;

    let mut refs = Vec::new();
    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() || line.ends_with("/HEAD") {
            continue;
        }
        let mut parts = line.split('|');
        let name = parts.next().unwrap_or("").to_string();
        let short_hash = parts.next().unwrap_or("").to_string();
        let upstream = parts
            .next()
            .filter(|v| !v.is_empty())
            .map(str::to_string);
        let track = parts.next().unwrap_or("");
        let (ahead, behind) = parse_track(track);
        let is_remote = name.contains('/');
        let is_current = !is_remote && current.as_deref() == Some(name.as_str());

        refs.push(BranchRefInfo {
            name,
            short_hash,
            is_remote,
            is_current,
            upstream,
            ahead,
            behind,
        });
    }

    refs.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(refs)
}

pub fn read_commit_graph(repo_root: String, limit: u32) -> Result<Vec<GraphCommit>, String> {
    let root = PathBuf::from(&repo_root);
    let count = limit.clamp(1, 500);
    let output = git_output(
        &root,
        &[
            "log",
            "--all",
            "--topo-order",
            &format!("-n{count}"),
            "--pretty=format:%H|%P|%h|%s|%an|%ai|%d",
        ],
    )?;

    Ok(output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(parse_graph_line)
        .collect())
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
}
