use crate::ssh_client::{connect_and_auth, SshHandle};
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::OpenFlags;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use uuid::Uuid;

const MAX_SFTP_TRANSFER_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    pub session_id: String,
    pub home_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<String>,
}

struct SftpConnection {
    _handle: SshHandle,
    sftp: SftpSession,
}

pub struct SftpManager {
    sessions: Mutex<HashMap<String, Arc<Mutex<SftpConnection>>>>,
}

impl SftpManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    async fn session(&self, session_id: &str) -> Result<Arc<Mutex<SftpConnection>>, String> {
        let sessions = self.sessions.lock().await;
        sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| format!("Unknown session: {session_id}"))
    }

    pub async fn connect(&self, request: crate::ssh_client::ConnectRequest) -> Result<ConnectResult, String> {
        let handle = connect_and_auth(&request).await?;

        let channel = handle
            .channel_open_session()
            .await
            .map_err(|err| format!("Could not open SSH session: {err}"))?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|err| format!("SFTP subsystem unavailable: {err}"))?;

        let sftp = SftpSession::new(channel.into_stream())
            .await
            .map_err(|err| format!("SFTP handshake failed: {err}"))?;

        let home_path = sftp
            .canonicalize(".")
            .await
            .unwrap_or_else(|_| "/".to_string());

        let session_id = Uuid::new_v4().to_string();
        self.sessions.lock().await.insert(
            session_id.clone(),
            Arc::new(Mutex::new(SftpConnection {
                _handle: handle,
                sftp,
            })),
        );

        Ok(ConnectResult {
            session_id,
            home_path,
        })
    }

    pub async fn disconnect(&self, session_id: &str) -> Result<(), String> {
        self.sessions
            .lock()
            .await
            .remove(session_id)
            .ok_or_else(|| format!("Unknown session: {session_id}"))?;
        Ok(())
    }

    pub async fn list_dir(&self, session_id: &str, path: &str) -> Result<Vec<SftpEntry>, String> {
        let conn_arc = self.session(session_id).await?;
        let conn = conn_arc.lock().await;
        let remote_path = normalize_remote_path(path);
        let rows = conn
            .sftp
            .read_dir(&remote_path)
            .await
            .map_err(|err| format!("Could not list directory: {err}"))?;

        let mut entries = Vec::new();
        for row in rows {
            let name = row.file_name();
            if name == "." || name == ".." {
                continue;
            }
            let meta = row.metadata();
            let is_dir = meta.is_dir() || row.file_type().is_dir();
            entries.push(SftpEntry {
                name: name.clone(),
                path: row.path(),
                is_dir,
                size: meta.len(),
                modified: None,
            });
        }

        entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.cmp(&b.name)));
        Ok(entries)
    }

    pub async fn create_dir(&self, session_id: &str, path: &str) -> Result<(), String> {
        let conn_arc = self.session(session_id).await?;
        let conn = conn_arc.lock().await;
        conn.sftp
            .create_dir(normalize_remote_path(path))
            .await
            .map_err(|err| format!("Could not create directory: {err}"))
    }

    pub async fn remove_path(
        &self,
        session_id: &str,
        path: &str,
        is_dir: bool,
    ) -> Result<(), String> {
        let conn_arc = self.session(session_id).await?;
        let conn = conn_arc.lock().await;
        let remote_path = normalize_remote_path(path);
        if is_dir {
            remove_dir_recursive(&conn.sftp, &remote_path).await
        } else {
            conn.sftp
                .remove_file(remote_path)
                .await
                .map_err(|err| format!("Could not remove file: {err}"))
        }
    }

    pub async fn download(&self, session_id: &str, path: &str) -> Result<Vec<u8>, String> {
        let conn_arc = self.session(session_id).await?;
        let conn = conn_arc.lock().await;
        let remote_path = normalize_remote_path(path);
        let meta = conn
            .sftp
            .metadata(&remote_path)
            .await
            .map_err(|err| format!("Could not read remote file metadata: {err}"))?;
        ensure_transfer_size(meta.len())?;
        conn.sftp
            .read(&remote_path)
            .await
            .map_err(|err| format!("Could not download file: {err}"))
    }

    pub async fn upload(&self, session_id: &str, path: &str, data: Vec<u8>) -> Result<(), String> {
        ensure_transfer_size(data.len() as u64)?;
        let conn_arc = self.session(session_id).await?;
        let conn = conn_arc.lock().await;
        let remote_path = normalize_remote_path(path);
        let mut file = conn
            .sftp
            .open_with_flags(
                remote_path,
                OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
            )
            .await
            .map_err(|err| format!("Could not open remote file for upload: {err}"))?;
        file.write_all(&data)
            .await
            .map_err(|err| format!("Could not upload file: {err}"))?;
        file.shutdown()
            .await
            .map_err(|err| format!("Could not finalize upload: {err}"))
    }
}

fn normalize_remote_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed == "." {
        return ".".to_string();
    }
    trimmed.replace('\\', "/")
}

fn ensure_transfer_size(len: u64) -> Result<(), String> {
    if len > MAX_SFTP_TRANSFER_BYTES {
        return Err(format!(
            "File exceeds the {MAX_SFTP_TRANSFER_BYTES} byte SFTP transfer limit ({len} bytes)"
        ));
    }
    Ok(())
}

async fn remove_dir_recursive(sftp: &SftpSession, path: &str) -> Result<(), String> {
    let rows = sftp
        .read_dir(path)
        .await
        .map_err(|err| format!("Could not list directory for removal: {err}"))?;
    for row in rows {
        let name = row.file_name();
        if name == "." || name == ".." {
            continue;
        }
        let child = row.path();
        let is_dir = row.metadata().is_dir() || row.file_type().is_dir();
        if is_dir {
            Box::pin(remove_dir_recursive(sftp, &child)).await?;
        } else {
            sftp.remove_file(&child)
                .await
                .map_err(|err| format!("Could not remove file: {err}"))?;
        }
    }
    sftp.remove_dir(path)
        .await
        .map_err(|err| format!("Could not remove directory: {err}"))
}
