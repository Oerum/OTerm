mod fs;
mod terminal;

use fs::commands::{
    fs_list_directory, fs_open_in_vscode, fs_search_files, fs_show_shell_context_menu, FsSearchState,
};
use terminal::commands::{
    terminal_kill, terminal_list_shells, terminal_resize, terminal_spawn, terminal_write,
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
            fs_list_directory,
            fs_open_in_vscode,
            fs_search_files,
            fs_show_shell_context_menu,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
