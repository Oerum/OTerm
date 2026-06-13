use super::manager::SshTerminalManager;
use crate::ssh_client::ConnectRequest;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn ssh_terminal_spawn(
    app: AppHandle,
    manager: State<'_, SshTerminalManager>,
    request: ConnectRequest,
    cols: u16,
    rows: u16,
    startup_snippet: Option<String>,
) -> Result<String, String> {
    manager
        .spawn(app, request, cols, rows, startup_snippet)
        .await
}

#[tauri::command]
pub async fn ssh_terminal_write(
    manager: State<'_, SshTerminalManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    manager.write(&session_id, &data).await
}

#[tauri::command]
pub async fn ssh_terminal_resize(
    manager: State<'_, SshTerminalManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    manager.resize(&session_id, cols, rows).await
}

#[tauri::command]
pub async fn ssh_terminal_kill(
    manager: State<'_, SshTerminalManager>,
    session_id: String,
) -> Result<(), String> {
    manager.kill(&session_id).await
}

#[tauri::command]
pub async fn ssh_terminal_kill_all(manager: State<'_, SshTerminalManager>) -> Result<(), String> {
    manager.kill_all().await;
    Ok(())
}
