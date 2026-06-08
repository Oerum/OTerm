use super::{
    checkout_branch, commit_changes, fetch_changes, list_branches, pull_changes, push_changes,
    read_log, resolve_file_diff, resolve_git_status, resolve_read_working_file,
    resolve_source_control, resolve_write_working_file, revert_tracked_paths,
    revert_untracked_paths, stage_paths, sync_changes, unstage_paths, GitBranchList,
    GitCommitEntry, GitFileDiff, GitSourceControlStatus, GitStatus, GitWorkingFile,
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
