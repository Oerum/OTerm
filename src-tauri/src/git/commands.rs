use super::branches::{
    cherry_pick_commit, checkout_detached, compare_commits, create_branch, create_tag,
    list_branch_refs, list_incoming_outgoing, read_commit_details, read_commit_graph,
    reset_commit, revert_commit, squash_commits, BranchRefInfo, CommitDetails, CompareResult,
    GraphCommit,
};
use super::pr::{
    checkout_pull_request, create_pull_request, detect_provider, list_pull_requests,
    remote_browser_url, PrProviderInfo, PullRequestSummary,
};
use super::{
    checkout_branch, commit_changes, fetch_changes, list_branches, pull_changes, push_changes,
    read_log, resolve_file_diff, resolve_git_status, resolve_read_working_file,
    resolve_source_control, resolve_staged_diff, resolve_write_working_file, revert_tracked_paths,
    revert_untracked_paths, stage_paths, sync_changes, unstage_paths, GitBranchList,
    GitCommitEntry, GitFileDiff, GitSourceControlStatus, GitStagedDiffContext, GitStatus,
    GitWorkingFile,
};

async fn blocking_git<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn git_status(path: Option<String>) -> Result<GitStatus, String> {
    blocking_git(move || resolve_git_status(path)).await
}

#[tauri::command]
pub async fn git_source_control_status(path: Option<String>) -> Result<GitSourceControlStatus, String> {
    blocking_git(move || resolve_source_control(path)).await
}

#[tauri::command]
pub async fn git_stage_paths(repo_root: String, paths: Vec<String>) -> Result<(), String> {
    blocking_git(move || stage_paths(repo_root, paths)).await
}

#[tauri::command]
pub async fn git_unstage_paths(repo_root: String, paths: Vec<String>) -> Result<(), String> {
    blocking_git(move || unstage_paths(repo_root, paths)).await
}

#[tauri::command]
pub async fn git_revert_tracked_paths(repo_root: String, paths: Vec<String>) -> Result<(), String> {
    blocking_git(move || revert_tracked_paths(repo_root, paths)).await
}

#[tauri::command]
pub async fn git_revert_untracked_paths(repo_root: String, paths: Vec<String>) -> Result<(), String> {
    blocking_git(move || revert_untracked_paths(repo_root, paths)).await
}

#[tauri::command]
pub async fn git_commit(repo_root: String, message: String) -> Result<(), String> {
    blocking_git(move || commit_changes(repo_root, message)).await
}

#[tauri::command]
pub async fn git_push(repo_root: String) -> Result<(), String> {
    blocking_git(move || push_changes(repo_root)).await
}

#[tauri::command]
pub async fn git_fetch(repo_root: String) -> Result<(), String> {
    blocking_git(move || fetch_changes(repo_root)).await
}

#[tauri::command]
pub async fn git_pull(repo_root: String) -> Result<(), String> {
    blocking_git(move || pull_changes(repo_root)).await
}

#[tauri::command]
pub async fn git_sync(repo_root: String) -> Result<(), String> {
    blocking_git(move || sync_changes(repo_root)).await
}

#[tauri::command]
pub async fn git_list_branches(repo_root: String) -> Result<GitBranchList, String> {
    blocking_git(move || list_branches(repo_root)).await
}

#[tauri::command]
pub async fn git_checkout_branch(
    repo_root: String,
    branch: String,
    is_remote: bool,
) -> Result<(), String> {
    blocking_git(move || checkout_branch(repo_root, branch, is_remote)).await
}

#[tauri::command]
pub async fn git_log(repo_root: String, limit: Option<u32>) -> Result<Vec<GitCommitEntry>, String> {
    let count = limit.unwrap_or(20);
    blocking_git(move || read_log(repo_root, count)).await
}

#[tauri::command]
pub async fn git_file_diff(
    repo_root: String,
    path: String,
    staged: bool,
    untracked: bool,
) -> Result<GitFileDiff, String> {
    blocking_git(move || resolve_file_diff(repo_root, path, staged, untracked)).await
}

#[tauri::command]
pub async fn git_staged_diff(repo_root: String) -> Result<GitStagedDiffContext, String> {
    blocking_git(move || resolve_staged_diff(repo_root)).await
}

#[tauri::command]
pub async fn git_read_working_file(repo_root: String, path: String) -> Result<GitWorkingFile, String> {
    blocking_git(move || resolve_read_working_file(repo_root, path)).await
}

#[tauri::command]
pub async fn git_write_working_file(
    repo_root: String,
    path: String,
    content: String,
) -> Result<(), String> {
    blocking_git(move || resolve_write_working_file(repo_root, path, content)).await
}

#[tauri::command]
pub async fn pr_detect_provider(repo_root: String) -> Result<PrProviderInfo, String> {
    blocking_git(move || detect_provider(repo_root)).await
}

#[tauri::command]
pub async fn pr_list(
    repo_root: String,
    include_closed: bool,
) -> Result<Vec<PullRequestSummary>, String> {
    blocking_git(move || list_pull_requests(repo_root, include_closed)).await
}

#[tauri::command]
pub async fn pr_create(
    repo_root: String,
    title: String,
    body: String,
    base: Option<String>,
    head: Option<String>,
    draft: bool,
) -> Result<PullRequestSummary, String> {
    blocking_git(move || create_pull_request(repo_root, title, body, base, head, draft)).await
}

#[tauri::command]
pub async fn pr_checkout(repo_root: String, number: u32) -> Result<(), String> {
    blocking_git(move || checkout_pull_request(repo_root, number)).await
}

#[tauri::command]
pub async fn git_remote_browser_url(
    repo_root: String,
    kind: String,
    name: Option<String>,
) -> Result<String, String> {
    blocking_git(move || remote_browser_url(repo_root, kind, name)).await
}

#[tauri::command]
pub async fn git_list_branch_refs(repo_root: String) -> Result<Vec<BranchRefInfo>, String> {
    blocking_git(move || list_branch_refs(repo_root)).await
}

#[tauri::command]
pub async fn git_commit_graph(
    repo_root: String,
    limit: Option<u32>,
) -> Result<Vec<GraphCommit>, String> {
    let count = limit.unwrap_or(200);
    blocking_git(move || read_commit_graph(repo_root, count)).await
}

#[tauri::command]
pub async fn git_commit_details(repo_root: String, hash: String) -> Result<CommitDetails, String> {
    blocking_git(move || read_commit_details(repo_root, hash)).await
}

#[tauri::command]
pub async fn git_compare_commits(
    repo_root: String,
    base: String,
    target: String,
) -> Result<CompareResult, String> {
    blocking_git(move || compare_commits(repo_root, base, target)).await
}

#[tauri::command]
pub async fn git_incoming_outgoing(
    repo_root: String,
    direction: String,
) -> Result<Vec<GitCommitEntry>, String> {
    blocking_git(move || list_incoming_outgoing(repo_root, direction)).await
}

#[tauri::command]
pub async fn git_checkout_detached(repo_root: String, hash: String) -> Result<(), String> {
    blocking_git(move || checkout_detached(repo_root, hash)).await
}

#[tauri::command]
pub async fn git_create_branch(
    repo_root: String,
    name: String,
    start_point: Option<String>,
) -> Result<(), String> {
    blocking_git(move || create_branch(repo_root, name, start_point)).await
}

#[tauri::command]
pub async fn git_create_tag(
    repo_root: String,
    name: String,
    commit: Option<String>,
    message: Option<String>,
) -> Result<(), String> {
    blocking_git(move || create_tag(repo_root, name, commit, message)).await
}

#[tauri::command]
pub async fn git_revert_commit(repo_root: String, hash: String) -> Result<(), String> {
    blocking_git(move || revert_commit(repo_root, hash)).await
}

#[tauri::command]
pub async fn git_reset_commit(
    repo_root: String,
    hash: String,
    mode: String,
) -> Result<(), String> {
    blocking_git(move || reset_commit(repo_root, hash, mode)).await
}

#[tauri::command]
pub async fn git_cherry_pick(repo_root: String, hash: String) -> Result<(), String> {
    blocking_git(move || cherry_pick_commit(repo_root, hash)).await
}

#[tauri::command]
pub async fn git_squash_commits(
    repo_root: String,
    count: u32,
    message: String,
) -> Result<(), String> {
    blocking_git(move || squash_commits(repo_root, count, message)).await
}
