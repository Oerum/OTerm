mod docker;
mod fs;
mod git;
mod launch;
mod lm;
mod process;
mod settings;
mod ssh_sftp;
mod terminal;

mod platform;

use docker::commands::{
    docker_container_action, docker_container_logs, docker_prune_unused, docker_remove_image,
    docker_remove_network, docker_remove_volume, docker_summary,
};
use fs::commands::{
    fs_import_env_file, fs_list_directory, fs_open_in_file_explorer, fs_open_in_rider,
    fs_open_in_visual_studio, fs_open_in_vscode, fs_open_in_zed, fs_search_files,
    fs_show_shell_context_menu, fs_tools_directory_hints, fs_write_temp_attachment,
    FsSearchState,
};
use git::commands::{
    git_checkout_branch, git_checkout_detached, git_cherry_pick, git_commit, git_commit_details,
    git_commit_graph, git_compare_commits, git_create_branch, git_create_tag, git_delete_branch,
    git_fetch, git_merge_branch,
    git_file_diff, git_incoming_outgoing, git_list_branch_refs, git_list_branches,
    git_list_worktrees, git_log,
    git_pull, git_push, git_read_working_file, git_remote_browser_url, git_reset_commit,
    git_revert_commit, git_revert_hunk, git_revert_tracked_paths, git_revert_untracked_paths,
    git_source_control_status, git_squash_commits, git_stage_hunk, git_stage_paths,
    git_staged_diff, git_status, git_sync, git_unstage_hunk, git_unstage_paths,
    git_write_working_file, issue_create_branch, issue_list, issue_view, pr_checkout, pr_comment,
    pr_commits, pr_checks, pr_create, pr_detect_provider, pr_diff, pr_files, pr_list, pr_view,
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
use launch::{launch_initial_cwd, LaunchState};
use terminal::commands::{
    terminal_default_shell_id, terminal_drain_output, terminal_kill, terminal_list_shells,
    terminal_resize, terminal_spawn, terminal_write,
};
use terminal::manager::PtyManager;

use std::sync::Arc;

#[tauri::command]
fn send_desktop_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let icon = platform::icon::resolve_notification_icon(&exe);

    #[cfg(windows)]
    {
        let app_id = app.config().identifier.clone();
        return platform::windows::toast::send(&app_id, &title, &body, &icon);
    }
    #[cfg(not(windows))]
    {
        platform::desktop::send(&app, &title, &body, &icon)
    }
}

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
    let launch_state = LaunchState::from_args();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(prevent_default())
        .manage(launch_state)
        .manage(PtyManager::new())
        .manage(SftpManager::new())
        .manage(Arc::new(FsSearchState::new()))
        .setup(|app| {
            #[cfg(windows)]
            {
                let config = app.config();
                let exe = std::env::current_exe().map_err(|e| e.to_string())?;
                let assets = platform::icon::prepare_notification_assets(&exe)
                    .map_err(|e| format!("notification icon cache failed: {e}"))?;
                let display_name = config
                    .product_name
                    .clone()
                    .unwrap_or_else(|| "OTerm".to_string());
                if let Err(error) = platform::windows::toast::init(
                    &platform::windows::toast::ToastIdentity {
                        app_id: config.identifier.clone(),
                        display_name,
                        assets,
                        exe_path: exe,
                    },
                ) {
                    eprintln!("oterm: toast branding init failed: {error}");
                }
            }
            tauri::async_runtime::spawn_blocking(|| {
                if let Err(error) =
                    fs::cleanup_old_composer_attachments(fs::COMPOSER_ATTACHMENTS_MAX_AGE_DAYS)
                {
                    eprintln!("oterm: composer attachment cleanup failed: {error}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_desktop_notification,
            launch_initial_cwd,
            terminal_list_shells,
            terminal_default_shell_id,
            terminal_spawn,
            terminal_write,
            terminal_resize,
            terminal_kill,
            terminal_drain_output,
            fs_list_directory,
            fs_tools_directory_hints,
            fs_open_in_visual_studio,
            fs_open_in_rider,
            fs_import_env_file,
            fs_open_in_vscode,
            fs_open_in_zed,
            fs_open_in_file_explorer,
            fs_search_files,
            fs_show_shell_context_menu,
            fs_write_temp_attachment,
            git_status,
            git_source_control_status,
            git_stage_paths,
            git_unstage_paths,
            git_revert_tracked_paths,
            git_revert_untracked_paths,
            git_revert_hunk,
            git_stage_hunk,
            git_unstage_hunk,
            git_commit,
            git_push,
            git_fetch,
            git_pull,
            git_sync,
            git_list_branches,
            git_list_worktrees,
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
            pr_view,
            pr_commits,
            pr_checks,
            pr_files,
            pr_diff,
            pr_comment,
            issue_list,
            issue_view,
            issue_create_branch,
            git_remote_browser_url,
            git_list_branch_refs,
            git_commit_graph,
            git_commit_details,
            git_compare_commits,
            git_incoming_outgoing,
            git_checkout_detached,
            git_create_branch,
            git_delete_branch,
            git_merge_branch,
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
