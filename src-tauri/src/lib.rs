mod docker;
mod fs;
mod git;
mod lm;
mod settings;
mod ssh_sftp;
mod terminal;

use docker::commands::{
    docker_container_action, docker_container_logs, docker_prune_unused, docker_remove_image,
    docker_remove_network, docker_remove_volume, docker_summary,
};
use fs::commands::{
    fs_list_directory, fs_open_in_vscode, fs_search_files, fs_show_shell_context_menu,
    FsSearchState,
};
use git::commands::{
    git_checkout_branch, git_checkout_detached, git_cherry_pick, git_commit, git_commit_details,
    git_commit_graph, git_compare_commits, git_create_branch, git_create_tag, git_fetch,
    git_file_diff, git_incoming_outgoing, git_list_branch_refs, git_list_branches, git_log,
    git_pull, git_push, git_read_working_file, git_remote_browser_url, git_reset_commit,
    git_revert_commit, git_revert_tracked_paths, git_revert_untracked_paths,
    git_source_control_status, git_squash_commits, git_stage_paths, git_staged_diff, git_status,
    git_sync, git_unstage_paths, git_write_working_file, pr_checkout, pr_create,
    pr_detect_provider, pr_list,
};
use lm::commands::{
    lm_chat_completion, lm_detect_github_copilot_token, lm_list_models, lm_test_connection,
};
use settings::commands::{
    settings_dir_path, settings_get, settings_get_all, settings_import, settings_set,
};
use ssh_sftp::commands::{
    ssh_sftp_connect, ssh_sftp_create_dir, ssh_sftp_disconnect, ssh_sftp_download,
    ssh_sftp_list_dir, ssh_sftp_remove_path, ssh_sftp_upload,
};
use ssh_sftp::session::SftpManager;
use terminal::commands::{
    terminal_drain_output, terminal_kill, terminal_list_shells, terminal_resize, terminal_spawn,
    terminal_write,
};
use terminal::manager::PtyManager;

use std::sync::Arc;

#[cfg(debug_assertions)]
fn prevent_default() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_prevent_default::debug()
}

#[cfg(not(debug_assertions))]
fn prevent_default() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    use tauri_plugin_prevent_default::{Flags, KeyboardShortcut, ModifierKey};

    tauri_plugin_prevent_default::Builder::new()
        .with_flags(Flags::CONTEXT_MENU | Flags::DEV_TOOLS)
        .shortcut(KeyboardShortcut::with_modifiers("D", &[ModifierKey::CtrlKey]))
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(prevent_default())
        .manage(PtyManager::new())
        .manage(SftpManager::new())
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
            git_staged_diff,
            git_read_working_file,
            lm_list_models,
            lm_test_connection,
            lm_detect_github_copilot_token,
            lm_chat_completion,
            git_write_working_file,
            pr_detect_provider,
            pr_list,
            pr_create,
            pr_checkout,
            git_remote_browser_url,
            git_list_branch_refs,
            git_commit_graph,
            git_commit_details,
            git_compare_commits,
            git_incoming_outgoing,
            git_checkout_detached,
            git_create_branch,
            git_create_tag,
            git_revert_commit,
            git_reset_commit,
            git_cherry_pick,
            git_squash_commits,
            docker_summary,
            docker_container_action,
            docker_remove_image,
            docker_remove_volume,
            docker_remove_network,
            docker_prune_unused,
            docker_container_logs,
            ssh_sftp_connect,
            ssh_sftp_disconnect,
            ssh_sftp_list_dir,
            ssh_sftp_create_dir,
            ssh_sftp_remove_path,
            ssh_sftp_download,
            ssh_sftp_upload,
            settings_get,
            settings_set,
            settings_get_all,
            settings_import,
            settings_dir_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
