mod fs;
mod git;
mod terminal;

use fs::commands::{
    fs_list_directory, fs_open_in_vscode, fs_search_files, fs_show_shell_context_menu, FsSearchState,
};
use git::commands::{
    git_checkout_branch, git_commit, git_fetch, git_file_diff, git_list_branches, git_log,
    git_pull, git_push, git_read_working_file, git_revert_tracked_paths, git_revert_untracked_paths,
    git_source_control_status, git_stage_paths, git_status, git_sync, git_unstage_paths,
    git_write_working_file,
};
use terminal::commands::{
    terminal_drain_output, terminal_kill, terminal_list_shells, terminal_resize, terminal_spawn,
    terminal_write,
};
use terminal::manager::PtyManager;

use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(PtyManager::new())
        .manage(Arc::new(FsSearchState::new()))
        .invoke_handler(tauri::generate_handler![
            terminal_list_shells,
            terminal_spawn,
            terminal_write,
            terminal_resize,
            terminal_kill,
            terminal_drain_output,
            fs_list_directory,
            fs_open_in_vscode,
            fs_search_files,
            fs_show_shell_context_menu,
            git_status,
            git_source_control_status,
            git_stage_paths,
            git_unstage_paths,
            git_revert_tracked_paths,
            git_revert_untracked_paths,
            git_commit,
            git_push,
            git_fetch,
            git_pull,
            git_sync,
            git_list_branches,
            git_checkout_branch,
            git_log,
            git_file_diff,
            git_read_working_file,
            git_write_working_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
