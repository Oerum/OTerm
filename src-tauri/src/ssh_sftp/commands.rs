use crate::ssh_client::ConnectRequest;
use super::session::SftpManager;
use tauri::State;

#[tauri::command]
pub async fn ssh_sftp_connect(
    manager: State<'_, SftpManager>,
    request: ConnectRequest,
) -> Result<super::session::ConnectResult, String> {
    manager.connect(request).await
}

#[tauri::command]
pub async fn ssh_sftp_disconnect(
    manager: State<'_, SftpManager>,
    session_id: String,
) -> Result<(), String> {
    manager.disconnect(&session_id).await
}

#[tauri::command]
pub async fn ssh_sftp_list_dir(
    manager: State<'_, SftpManager>,
    session_id: String,
    path: String,
) -> Result<Vec<super::session::SftpEntry>, String> {
    manager.list_dir(&session_id, &path).await
}

#[tauri::command]
pub async fn ssh_sftp_create_dir(
    manager: State<'_, SftpManager>,
    session_id: String,
    path: String,
) -> Result<(), String> {
    manager.create_dir(&session_id, &path).await
}

#[tauri::command]
pub async fn ssh_sftp_remove_path(
    manager: State<'_, SftpManager>,
    session_id: String,
    path: String,
    is_dir: bool,
) -> Result<(), String> {
    manager.remove_path(&session_id, &path, is_dir).await
}

#[tauri::command]
pub async fn ssh_sftp_download(
    manager: State<'_, SftpManager>,
    session_id: String,
    path: String,
) -> Result<Vec<u8>, String> {
    manager.download(&session_id, &path).await
}

#[tauri::command]
pub async fn ssh_sftp_upload(
    manager: State<'_, SftpManager>,
    session_id: String,
    path: String,
    data: Vec<u8>,
) -> Result<(), String> {
    manager.upload(&session_id, &path, data).await
}
