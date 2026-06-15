use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::process::{gh_program, hidden_command};

use super::git_output;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrProviderInfo {
    pub provider: Option<String>,
    pub remote_url: Option<String>,
    pub can_use_cli: bool,
    pub auth_ok: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestSummary {
    pub number: u32,
    pub title: String,
    pub state: String,
    pub url: String,
    pub head_ref: String,
    pub base_ref: String,
    pub author: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_draft: bool,
}

#[derive(Debug, Deserialize)]
struct GhPrRow {
    number: u32,
    title: String,
    state: String,
    url: String,
    #[serde(rename = "headRefName")]
    head_ref_name: String,
    #[serde(rename = "baseRefName")]
    base_ref_name: String,
    author: GhAuthor,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    #[serde(rename = "isDraft")]
    is_draft: bool,
}

#[derive(Debug, Deserialize)]
struct GhAuthor {
    login: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestComment {
    pub author: String,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestReview {
    pub author: String,
    pub state: String,
    pub body: String,
    pub submitted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestDetail {
    pub number: u32,
    pub title: String,
    pub state: String,
    pub url: String,
    pub head_ref: String,
    pub base_ref: String,
    pub author: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_draft: bool,
    pub body: String,
    pub comments: Vec<PullRequestComment>,
    pub reviews: Vec<PullRequestReview>,
    pub additions: u32,
    pub deletions: u32,
    pub changed_files: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrCommit {
    pub oid: String,
    pub short_oid: String,
    pub message_headline: String,
    pub message_body: String,
    pub author: String,
    pub committed_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrCheck {
    pub name: String,
    pub state: String,
    pub bucket: String,
    pub link: Option<String>,
    pub description: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub workflow: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrChangedFile {
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
    pub change_type: String,
}

#[derive(Debug, Deserialize)]
struct GhPrView {
    title: String,
    body: Option<String>,
    state: String,
    url: String,
    #[serde(rename = "headRefName")]
    head_ref_name: String,
    #[serde(rename = "baseRefName")]
    base_ref_name: String,
    author: GhAuthor,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    #[serde(rename = "isDraft")]
    is_draft: bool,
    comments: Vec<GhPrComment>,
    reviews: Vec<GhPrReview>,
    additions: u32,
    deletions: u32,
    #[serde(rename = "changedFiles")]
    changed_files: u32,
}

#[derive(Debug, Deserialize)]
struct GhPrComment {
    author: GhAuthor,
    body: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Debug, Deserialize)]
struct GhPrReview {
    author: GhAuthor,
    body: Option<String>,
    state: String,
    #[serde(rename = "submittedAt")]
    submitted_at: String,
}

#[derive(Debug, Deserialize)]
struct GhCommitsResponse {
    commits: Vec<GhCommitRow>,
}

#[derive(Debug, Deserialize)]
struct GhCommitRow {
    oid: String,
    #[serde(rename = "messageHeadline")]
    message_headline: String,
    #[serde(rename = "messageBody")]
    message_body: Option<String>,
    authors: Vec<GhCommitAuthor>,
    #[serde(rename = "committedDate")]
    committed_date: String,
}

#[derive(Debug, Deserialize)]
struct GhCommitAuthor {
    login: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GhFilesResponse {
    files: Vec<GhFileRow>,
}

#[derive(Debug, Deserialize)]
struct GhFileRow {
    path: String,
    additions: u32,
    deletions: u32,
    #[serde(rename = "changeType", default = "default_file_change_type")]
    change_type: String,
}

fn default_file_change_type() -> String {
    "MODIFIED".into()
}

#[derive(Debug, Deserialize)]
struct GhCheckRow {
    name: String,
    state: String,
    bucket: String,
    link: Option<String>,
    description: Option<String>,
    #[serde(rename = "startedAt")]
    started_at: Option<String>,
    #[serde(rename = "completedAt")]
    completed_at: Option<String>,
    workflow: Option<String>,
}

pub fn ensure_github_ready(repo_root: String) -> Result<(), String> {
    let info = detect_provider(repo_root)?;
    if info.provider.as_deref() != Some("github") {
        return Err(info
            .message
            .unwrap_or_else(|| "Unsupported provider".into()));
    }
    if !info.can_use_cli || !info.auth_ok {
        return Err(info
            .message
            .unwrap_or_else(|| "GitHub CLI not ready".into()));
    }
    Ok(())
}

pub fn detect_provider(repo_root: String) -> Result<PrProviderInfo, String> {
    let root = PathBuf::from(&repo_root);
    if !root.is_dir() {
        return Err("Repository root does not exist".into());
    }

    let remote_url = git_output(&root, &["remote", "get-url", "origin"]).ok();
    let provider = remote_url.as_deref().map(detect_provider_from_url);

    let (can_use_cli, auth_ok, message) = match provider.as_deref() {
        Some("github") => {
            let gh_ok = hidden_command(&gh_program())
                .arg("--version")
                .output()
                .is_ok();
            if !gh_ok {
                (
                    false,
                    false,
                    Some("Install GitHub CLI (gh) to manage pull requests".into()),
                )
            } else {
                let auth = hidden_command(&gh_program())
                    .args(["auth", "status"])
                    .current_dir(&root)
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false);
                (
                    true,
                    auth,
                    if auth {
                        None
                    } else {
                        Some("Run `gh auth login` to authenticate".into())
                    },
                )
            }
        }
        Some(other) => (
            false,
            false,
            Some(format!("Provider '{other}' is not supported yet")),
        ),
        None => (false, false, Some("No origin remote configured".into())),
    };

    Ok(PrProviderInfo {
        provider,
        remote_url,
        can_use_cli,
        auth_ok,
        message,
    })
}

pub fn list_pull_requests(
    repo_root: String,
    include_closed: bool,
) -> Result<Vec<PullRequestSummary>, String> {
    let root = PathBuf::from(&repo_root);
    ensure_github_ready(repo_root)?;

    let state = if include_closed { "all" } else { "open" };
    let output = gh_output(
        &root,
        &[
            "pr",
            "list",
            "--state",
            state,
            "--limit",
            "100",
            "--json",
            "number,title,state,url,headRefName,baseRefName,author,createdAt,updatedAt,isDraft",
        ],
    )?;

    let rows: Vec<GhPrRow> = serde_json::from_str(&output).map_err(|err| err.to_string())?;
    Ok(rows
        .into_iter()
        .map(|row| PullRequestSummary {
            number: row.number,
            title: row.title,
            state: row.state,
            url: row.url,
            head_ref: row.head_ref_name,
            base_ref: row.base_ref_name,
            author: row.author.login,
            created_at: row.created_at,
            updated_at: row.updated_at,
            is_draft: row.is_draft,
        })
        .collect())
}

pub fn create_pull_request(
    repo_root: String,
    title: String,
    body: String,
    base: Option<String>,
    head: Option<String>,
    draft: bool,
) -> Result<PullRequestSummary, String> {
    let root = PathBuf::from(&repo_root);
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err("PR title is required".into());
    }

    let mut args = vec![
        "pr",
        "create",
        "--title",
        trimmed_title,
        "--body",
        body.as_str(),
    ];
    if draft {
        args.push("--draft");
    }
    if let Some(ref base_ref) = base {
        if !base_ref.trim().is_empty() {
            args.push("--base");
            args.push(base_ref.as_str());
        }
    }
    if let Some(ref head_ref) = head {
        if !head_ref.trim().is_empty() {
            args.push("--head");
            args.push(head_ref.as_str());
        }
    }

    let url = gh_output(&root, &args)?;
    let url = url.lines().last().unwrap_or(&url).trim().to_string();
    let number = url
        .rsplit('/')
        .next()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    Ok(PullRequestSummary {
        number,
        title: trimmed_title.into(),
        state: "OPEN".into(),
        url,
        head_ref: head.unwrap_or_default(),
        base_ref: base.unwrap_or_default(),
        author: String::new(),
        created_at: String::new(),
        updated_at: String::new(),
        is_draft: draft,
    })
}

pub fn checkout_pull_request(repo_root: String, number: u32) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    gh_run(&root, &["pr", "checkout", &number.to_string()])
}

pub fn view_pull_request(repo_root: String, number: u32) -> Result<PullRequestDetail, String> {
    let root = PathBuf::from(&repo_root);
    ensure_github_ready(repo_root)?;

    let output = gh_output(
        &root,
        &[
            "pr",
            "view",
            &number.to_string(),
            "--json",
            "title,body,state,url,author,headRefName,baseRefName,createdAt,updatedAt,isDraft,comments,reviews,additions,deletions,changedFiles",
        ],
    )?;

    let row: GhPrView = serde_json::from_str(&output).map_err(|err| err.to_string())?;
    Ok(map_pr_view(number, row))
}

pub fn list_pr_commits(repo_root: String, number: u32) -> Result<Vec<PrCommit>, String> {
    let root = PathBuf::from(&repo_root);
    ensure_github_ready(repo_root)?;

    let output = gh_output(
        &root,
        &["pr", "view", &number.to_string(), "--json", "commits"],
    )?;

    let row: GhCommitsResponse = serde_json::from_str(&output).map_err(|err| err.to_string())?;
    Ok(row.commits.into_iter().map(map_pr_commit).collect())
}

pub fn list_pr_checks(repo_root: String, number: u32) -> Result<Vec<PrCheck>, String> {
    let root = PathBuf::from(&repo_root);
    ensure_github_ready(repo_root)?;

    let output = gh_pr_checks_json(
        &root,
        &number.to_string(),
        "name,state,bucket,link,description,startedAt,completedAt,workflow",
    )?;

    let rows: Vec<GhCheckRow> = serde_json::from_str(&output).map_err(|err| err.to_string())?;
    Ok(rows
        .into_iter()
        .map(|row| PrCheck {
            name: row.name,
            state: row.state,
            bucket: row.bucket,
            link: row.link,
            description: row.description,
            started_at: row.started_at,
            completed_at: row.completed_at,
            workflow: row.workflow,
        })
        .collect())
}

pub fn list_pr_files(repo_root: String, number: u32) -> Result<Vec<PrChangedFile>, String> {
    let root = PathBuf::from(&repo_root);
    ensure_github_ready(repo_root)?;

    let output = gh_output(
        &root,
        &["pr", "view", &number.to_string(), "--json", "files"],
    )?;

    let row: GhFilesResponse = serde_json::from_str(&output).map_err(|err| err.to_string())?;
    Ok(row
        .files
        .into_iter()
        .map(|file| PrChangedFile {
            path: file.path,
            additions: file.additions,
            deletions: file.deletions,
            change_type: file.change_type,
        })
        .collect())
}

pub fn pull_request_diff(repo_root: String, number: u32) -> Result<String, String> {
    let root = PathBuf::from(&repo_root);
    ensure_github_ready(repo_root)?;
    gh_output(&root, &["pr", "diff", &number.to_string(), "--patch"])
}

pub fn comment_on_pull_request(repo_root: String, number: u32, body: String) -> Result<(), String> {
    let root = PathBuf::from(&repo_root);
    ensure_github_ready(repo_root)?;
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return Err("Comment body is required".into());
    }
    gh_run(
        &root,
        &["pr", "comment", &number.to_string(), "--body", trimmed],
    )
}

fn map_pr_view(number: u32, row: GhPrView) -> PullRequestDetail {
    PullRequestDetail {
        number,
        title: row.title,
        state: row.state,
        url: row.url,
        head_ref: row.head_ref_name,
        base_ref: row.base_ref_name,
        author: row.author.login,
        created_at: row.created_at,
        updated_at: row.updated_at,
        is_draft: row.is_draft,
        body: row.body.unwrap_or_default(),
        comments: row
            .comments
            .into_iter()
            .map(|comment| PullRequestComment {
                author: comment.author.login,
                body: comment.body.unwrap_or_default(),
                created_at: comment.created_at,
            })
            .collect(),
        reviews: row
            .reviews
            .into_iter()
            .map(|review| PullRequestReview {
                author: review.author.login,
                state: review.state,
                body: review.body.unwrap_or_default(),
                submitted_at: review.submitted_at,
            })
            .collect(),
        additions: row.additions,
        deletions: row.deletions,
        changed_files: row.changed_files,
    }
}

fn map_pr_commit(row: GhCommitRow) -> PrCommit {
    let author = row
        .authors
        .first()
        .and_then(|a| a.login.clone().or_else(|| a.name.clone()))
        .unwrap_or_default();
    let short_oid = row.oid.chars().take(7).collect::<String>();
    PrCommit {
        short_oid,
        oid: row.oid,
        message_headline: row.message_headline,
        message_body: row.message_body.unwrap_or_default(),
        author,
        committed_date: row.committed_date,
    }
}

pub fn remote_browser_url(
    repo_root: String,
    kind: String,
    name: Option<String>,
) -> Result<String, String> {
    let root = PathBuf::from(repo_root);
    let remote_url = git_output(&root, &["remote", "get-url", "origin"])?;
    let provider = detect_provider_from_url(&remote_url);
    if provider != "github" {
        return Err("Browser URLs are only supported for GitHub in this version".into());
    }

    let (owner, repo) = parse_github_remote(&remote_url)?;
    match kind.as_str() {
        "repo" => Ok(format!("https://github.com/{owner}/{repo}")),
        "branch" => {
            let branch = name.ok_or("Branch name required")?;
            Ok(format!("https://github.com/{owner}/{repo}/tree/{branch}"))
        }
        "commit" => {
            let hash = name.ok_or("Commit hash required")?;
            Ok(format!("https://github.com/{owner}/{repo}/commit/{hash}"))
        }
        _ => Err("Unknown URL kind".into()),
    }
}

pub(crate) fn gh_output(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let output = hidden_command(&gh_program())
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|err| format!("Failed to run gh: {err}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// `gh pr checks` exits 1 with a stderr message when a branch has no checks.
fn gh_pr_checks_json(cwd: &Path, number: &str, fields: &str) -> Result<String, String> {
    let output = hidden_command(&gh_program())
        .args(["pr", "checks", number, "--json", fields])
        .current_dir(cwd)
        .output()
        .map_err(|err| format!("Failed to run gh: {err}"))?;

    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).into_owned());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.to_ascii_lowercase().contains("no checks reported") {
        return Ok("[]".into());
    }

    Err(stderr.into_owned())
}

pub(crate) fn gh_run(cwd: &Path, args: &[&str]) -> Result<(), String> {
    let output = hidden_command(&gh_program())
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|err| format!("Failed to run gh: {err}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    Ok(())
}

pub fn detect_provider_from_url(url: &str) -> String {
    let lower = url.to_ascii_lowercase();
    if lower.contains("github.com") {
        "github".into()
    } else if lower.contains("gitlab") {
        "gitlab".into()
    } else if lower.contains("bitbucket") {
        "bitbucket".into()
    } else {
        "unknown".into()
    }
}

fn parse_github_remote(url: &str) -> Result<(String, String), String> {
    let trimmed = url.trim().trim_end_matches(".git");
    if let Some(rest) = trimmed.strip_prefix("git@github.com:") {
        let mut parts = rest.split('/');
        let owner = parts.next().ok_or("Invalid GitHub remote")?;
        let repo = parts.next().ok_or("Invalid GitHub remote")?;
        return Ok((owner.into(), repo.into()));
    }
    if let Some(rest) = trimmed.strip_prefix("https://github.com/") {
        let mut parts = rest.split('/');
        let owner = parts.next().ok_or("Invalid GitHub remote")?;
        let repo = parts.next().ok_or("Invalid GitHub remote")?;
        return Ok((owner.into(), repo.into()));
    }
    Err("Unsupported GitHub remote URL format".into())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubUserProfile {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
}

#[derive(Debug, Deserialize)]
struct GhApiUser {
    login: String,
    name: Option<String>,
    avatar_url: String,
}

fn gh_installed() -> bool {
    hidden_command(&gh_program())
        .arg("--version")
        .output()
        .is_ok()
}

fn gh_authenticated() -> bool {
    hidden_command(&gh_program())
        .args(["auth", "status"])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

pub fn fetch_github_user_profile() -> Result<Option<GitHubUserProfile>, String> {
    if !gh_installed() || !gh_authenticated() {
        return Ok(None);
    }

    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let json = gh_output(&cwd, &["api", "user"])?;
    let user: GhApiUser = serde_json::from_str(&json)
        .map_err(|err| format!("Failed to parse GitHub user profile: {err}"))?;

    Ok(Some(GitHubUserProfile {
        login: user.login,
        name: user.name.filter(|value| !value.trim().is_empty()),
        avatar_url: user.avatar_url,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_github_remote() {
        assert_eq!(
            detect_provider_from_url("https://github.com/oerum/oterm.git"),
            "github"
        );
    }

    #[test]
    fn parses_github_ssh_remote() {
        let (owner, repo) = parse_github_remote("git@github.com:oerum/oterm.git").unwrap();
        assert_eq!(owner, "oerum");
        assert_eq!(repo, "oterm");
    }

    #[test]
    fn deserializes_pr_view_with_null_body() {
        let json = r#"{
            "title": "Feature",
            "body": null,
            "state": "OPEN",
            "url": "https://github.com/oerum/oterm/pull/12",
            "headRefName": "feature",
            "baseRefName": "main",
            "author": {"login": "alice"},
            "createdAt": "2026-01-01",
            "updatedAt": "2026-01-02",
            "isDraft": false,
            "comments": [],
            "reviews": [],
            "additions": 10,
            "deletions": 2,
            "changedFiles": 3
        }"#;
        let row: GhPrView = serde_json::from_str(json).unwrap();
        let detail = map_pr_view(12, row);
        assert_eq!(detail.body, "");
        assert_eq!(detail.changed_files, 3);
    }

    #[test]
    fn maps_pr_commit_author_from_login() {
        let row = GhCommitRow {
            oid: "abc123def456".into(),
            message_headline: "Fix bug".into(),
            message_body: Some("Details".into()),
            authors: vec![GhCommitAuthor {
                login: Some("bob".into()),
                name: Some("Bob".into()),
            }],
            committed_date: "2026-01-01".into(),
        };
        let commit = map_pr_commit(row);
        assert_eq!(commit.short_oid, "abc123d");
        assert_eq!(commit.author, "bob");
    }

    #[test]
    fn deserializes_pr_checks() {
        let json = r#"[
            {
                "name": "build",
                "state": "SUCCESS",
                "bucket": "pass",
                "link": "https://example.com/build/1",
                "description": null,
                "startedAt": "2026-01-01T00:00:00Z",
                "completedAt": "2026-01-01T00:05:00Z",
                "workflow": "CI"
            }
        ]"#;
        let rows: Vec<GhCheckRow> = serde_json::from_str(json).unwrap();
        assert_eq!(rows[0].bucket, "pass");
    }

    #[test]
    fn deserializes_pr_files_without_change_type() {
        let json = r#"{"files":[{"path":"src/a.ts","additions":2,"deletions":0}]}"#;
        let row: GhFilesResponse = serde_json::from_str(json).unwrap();
        assert_eq!(row.files[0].path, "src/a.ts");
        assert_eq!(row.files[0].change_type, "MODIFIED");
    }

    #[test]
    fn deserializes_github_api_user() {
        let json = r#"{
            "login": "alice",
            "name": "Alice Example",
            "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4"
        }"#;
        let user: GhApiUser = serde_json::from_str(json).unwrap();
        assert_eq!(user.login, "alice");
        assert_eq!(user.name.as_deref(), Some("Alice Example"));
        assert!(user.avatar_url.contains("avatars.githubusercontent.com"));
    }
}
