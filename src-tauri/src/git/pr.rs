use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

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

pub fn detect_provider(repo_root: String) -> Result<PrProviderInfo, String> {
    let root = PathBuf::from(&repo_root);
    if !root.is_dir() {
        return Err("Repository root does not exist".into());
    }

    let remote_url = git_output(&root, &["remote", "get-url", "origin"]).ok();
    let provider = remote_url.as_deref().map(detect_provider_from_url);

    let (can_use_cli, auth_ok, message) = match provider.as_deref() {
        Some("github") => {
            let gh_ok = Command::new("gh").arg("--version").output().is_ok();
            if !gh_ok {
                (
                    false,
                    false,
                    Some("Install GitHub CLI (gh) to manage pull requests".into()),
                )
            } else {
                let auth = Command::new("gh")
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
        None => (
            false,
            false,
            Some("No origin remote configured".into()),
        ),
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
    let info = detect_provider(repo_root.clone())?;
    if info.provider.as_deref() != Some("github") {
        return Err(info.message.unwrap_or_else(|| "Unsupported provider".into()));
    }
    if !info.can_use_cli || !info.auth_ok {
        return Err(info.message.unwrap_or_else(|| "GitHub CLI not ready".into()));
    }

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

    let mut args = vec!["pr", "create", "--title", trimmed_title, "--body", body.as_str()];
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

fn gh_output(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("gh")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|err| format!("Failed to run gh: {err}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn gh_run(cwd: &Path, args: &[&str]) -> Result<(), String> {
    let output = Command::new("gh")
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
}
