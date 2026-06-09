use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::pr::{detect_provider, gh_output, gh_run};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueListFilters {
    pub state: String,
    pub label: Option<String>,
    pub author: Option<String>,
    pub assignee: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueSummary {
    pub number: u32,
    pub title: String,
    pub state: String,
    pub url: String,
    pub author: String,
    pub labels: Vec<String>,
    pub assignees: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueComment {
    pub author: String,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueDetail {
    pub number: u32,
    pub title: String,
    pub state: String,
    pub url: String,
    pub author: String,
    pub labels: Vec<String>,
    pub assignees: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub body: String,
    pub comments: Vec<IssueComment>,
}

#[derive(Debug, Deserialize)]
struct GhIssueRow {
    number: u32,
    title: String,
    state: String,
    url: String,
    author: GhLogin,
    labels: Vec<GhLabel>,
    assignees: Vec<GhLogin>,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct GhIssueView {
    title: String,
    body: String,
    state: String,
    url: String,
    author: GhLogin,
    labels: Vec<GhLabel>,
    assignees: Vec<GhLogin>,
    comments: Vec<GhIssueComment>,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct GhIssueComment {
    author: GhLogin,
    body: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Debug, Deserialize)]
struct GhLogin {
    login: String,
}

#[derive(Debug, Deserialize)]
struct GhLabel {
    name: String,
}

pub fn list_issues(repo_root: String, filters: IssueListFilters) -> Result<Vec<IssueSummary>, String> {
    let root = PathBuf::from(&repo_root);
    ensure_github_ready(repo_root.clone())?;

    let state = normalize_issue_state(&filters.state);
    let mut arg_strings = vec![
        "issue".to_string(),
        "list".to_string(),
        "--state".to_string(),
        state.to_string(),
        "--limit".to_string(),
        "100".to_string(),
        "--json".to_string(),
        "number,title,state,url,author,labels,assignees,createdAt,updatedAt".to_string(),
    ];

    if let Some(label) = optional_filter(filters.label) {
        arg_strings.push("--label".to_string());
        arg_strings.push(label);
    }
    if let Some(author) = optional_filter(filters.author) {
        arg_strings.push("--author".to_string());
        arg_strings.push(author);
    }
    if let Some(assignee) = optional_filter(filters.assignee) {
        arg_strings.push("--assignee".to_string());
        arg_strings.push(assignee);
    }

    let args: Vec<&str> = arg_strings.iter().map(String::as_str).collect();
    let output = gh_output(&root, &args)?;
    let rows: Vec<GhIssueRow> = serde_json::from_str(&output).map_err(|err| err.to_string())?;
    Ok(rows.into_iter().map(map_issue_row).collect())
}

pub fn view_issue(repo_root: String, number: u32) -> Result<IssueDetail, String> {
    let root = PathBuf::from(&repo_root);
    ensure_github_ready(repo_root)?;

    let output = gh_output(
        &root,
        &[
            "issue",
            "view",
            &number.to_string(),
            "--json",
            "title,body,state,url,author,labels,assignees,comments,createdAt,updatedAt",
        ],
    )?;

    let row: GhIssueView = serde_json::from_str(&output).map_err(|err| err.to_string())?;
    Ok(IssueDetail {
        number,
        title: row.title,
        state: row.state,
        url: row.url,
        author: row.author.login,
        labels: label_names(row.labels),
        assignees: login_names(row.assignees),
        created_at: row.created_at,
        updated_at: row.updated_at,
        body: row.body,
        comments: row
            .comments
            .into_iter()
            .map(|comment| IssueComment {
                author: comment.author.login,
                body: comment.body,
                created_at: comment.created_at,
            })
            .collect(),
    })
}

pub fn create_branch_from_issue(repo_root: String, number: u32) -> Result<(), String> {
    let root = PathBuf::from(&repo_root);
    ensure_github_ready(repo_root)?;
    gh_run(&root, &["issue", "develop", &number.to_string()])
}

fn ensure_github_ready(repo_root: String) -> Result<(), String> {
    let info = detect_provider(repo_root)?;
    if info.provider.as_deref() != Some("github") {
        return Err(info.message.unwrap_or_else(|| "Unsupported provider".into()));
    }
    if !info.can_use_cli || !info.auth_ok {
        return Err(info.message.unwrap_or_else(|| "GitHub CLI not ready".into()));
    }
    Ok(())
}

fn map_issue_row(row: GhIssueRow) -> IssueSummary {
    IssueSummary {
        number: row.number,
        title: row.title,
        state: row.state,
        url: row.url,
        author: row.author.login,
        labels: label_names(row.labels),
        assignees: login_names(row.assignees),
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

fn label_names(labels: Vec<GhLabel>) -> Vec<String> {
    labels.into_iter().map(|label| label.name).collect()
}

fn login_names(users: Vec<GhLogin>) -> Vec<String> {
    users.into_iter().map(|user| user.login).collect()
}

fn optional_filter(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

pub fn normalize_issue_state(state: &str) -> &'static str {
    match state.trim().to_ascii_lowercase().as_str() {
        "closed" => "closed",
        "all" => "all",
        _ => "open",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_issue_state_values() {
        assert_eq!(normalize_issue_state("open"), "open");
        assert_eq!(normalize_issue_state("CLOSED"), "closed");
        assert_eq!(normalize_issue_state("all"), "all");
        assert_eq!(normalize_issue_state("unknown"), "open");
    }

    #[test]
    fn maps_labels_and_assignees() {
        let row = GhIssueRow {
            number: 4,
            title: "Browse issues".into(),
            state: "OPEN".into(),
            url: "https://example.com/issues/4".into(),
            author: GhLogin {
                login: "alice".into(),
            },
            labels: vec![
                GhLabel {
                    name: "enhancement".into(),
                },
                GhLabel {
                    name: "frontend".into(),
                },
            ],
            assignees: vec![
                GhLogin {
                    login: "bob".into(),
                },
                GhLogin {
                    login: "carol".into(),
                },
            ],
            created_at: "2026-01-01".into(),
            updated_at: "2026-01-02".into(),
        };

        let summary = map_issue_row(row);
        assert_eq!(summary.number, 4);
        assert_eq!(summary.labels, vec!["enhancement", "frontend"]);
        assert_eq!(summary.assignees, vec!["bob", "carol"]);
    }

    #[test]
    fn optional_filter_trims_and_drops_empty() {
        assert_eq!(optional_filter(Some(" bug ".into())), Some("bug".into()));
        assert_eq!(optional_filter(Some("   ".into())), None);
        assert_eq!(optional_filter(None), None);
    }
}
