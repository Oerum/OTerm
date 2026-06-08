use super::{
    commit_changes, read_log, resolve_file_diff, resolve_git_status, resolve_read_working_file,
    resolve_source_control, resolve_write_working_file, revert_tracked_paths,
    revert_untracked_paths, stage_paths, unstage_paths, GitCommitEntry, GitFileDiff,
    GitSourceControlStatus, GitStatus, GitWorkingFile,
};

#[tauri::command]
pub fn git_status(path: Option<String>) -> Result<GitStatus, String> {
    resolve_git_status(path)
}

#[tauri::command]
pub fn git_source_control_status(path: Option<String>) -> Result<GitSourceControlStatus, String> {
    resolve_source_control(path)
}

#[tauri::command]
pub fn git_stage_paths(repo_root: String, paths: Vec<String>) -> Result<(), String> {
    stage_paths(repo_root, paths)
}

#[tauri::command]
pub fn git_unstage_paths(repo_root: String, paths: Vec<String>) -> Result<(), String> {
    unstage_paths(repo_root, paths)
}

#[tauri::command]
pub fn git_revert_tracked_paths(repo_root: String, paths: Vec<String>) -> Result<(), String> {
    revert_tracked_paths(repo_root, paths)
}

#[tauri::command]
pub fn git_revert_untracked_paths(repo_root: String, paths: Vec<String>) -> Result<(), String> {
    revert_untracked_paths(repo_root, paths)
}

#[tauri::command]
pub fn git_commit(repo_root: String, message: String) -> Result<(), String> {
    commit_changes(repo_root, message)
}

#[tauri::command]
pub fn git_log(repo_root: String, limit: Option<u32>) -> Result<Vec<GitCommitEntry>, String> {
    read_log(repo_root, limit.unwrap_or(20))
}

#[tauri::command]
pub fn git_file_diff(
    repo_root: String,
    path: String,
    staged: bool,
    untracked: bool,
) -> Result<GitFileDiff, String> {
    resolve_file_diff(repo_root, path, staged, untracked)
}

#[tauri::command]
pub fn git_read_working_file(repo_root: String, path: String) -> Result<GitWorkingFile, String> {
    resolve_read_working_file(repo_root, path)
}

#[tauri::command]
pub fn git_write_working_file(
    repo_root: String,
    path: String,
    content: String,
) -> Result<(), String> {
    resolve_write_working_file(repo_root, path, content)
}
