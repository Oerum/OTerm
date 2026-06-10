use crate::terminal::manager::PtyManager;
use crate::terminal::profiles::ShellProfile;
use tauri::State;

#[tauri::command]
pub fn terminal_list_shells(manager: State<'_, PtyManager>) -> Vec<ShellProfile> {
    manager.list_shells()
}

#[tauri::command]
pub fn terminal_default_shell_id() -> String {
    crate::terminal::profiles::default_shell_id()
}

#[tauri::command]
pub fn terminal_spawn(
    app: tauri::AppHandle,
    manager: State<'_, PtyManager>,
    shell_id: String,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<String, String> {
    manager.spawn(app, shell_id, cols, rows, cwd)
}

#[tauri::command]
pub fn terminal_write(
    manager: State<'_, PtyManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    manager.write(&session_id, &data)
}

#[tauri::command]
pub fn terminal_resize(
    manager: State<'_, PtyManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    manager.resize(&session_id, cols, rows)
}

#[tauri::command]
pub fn terminal_kill(manager: State<'_, PtyManager>, session_id: String) -> Result<(), String> {
    manager.kill(&session_id)
}

#[tauri::command]
pub fn terminal_drain_output(
    manager: State<'_, PtyManager>,
    session_id: String,
) -> Result<String, String> {
    manager.drain_output(&session_id)
}
