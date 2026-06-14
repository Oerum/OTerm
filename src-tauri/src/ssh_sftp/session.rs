use crate::ssh_client::{connect_and_auth, SshHandle};
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::OpenFlags;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::sync::{Mutex, Semaphore};
use uuid::Uuid;

const MAX_TRANSFER_CHANNELS: usize = 1000;

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
    handle: SshHandle,
    primary: Mutex<SftpSession>,
    transfer_permits: Arc<Semaphore>,
}

pub struct SftpManager {
    sessions: Mutex<HashMap<String, Arc<SftpConnection>>>,
}

impl SftpManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    async fn connection(&self, session_id: &str) -> Result<Arc<SftpConnection>, String> {
        let sessions = self.sessions.lock().await;
        sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| format!("Unknown session: {session_id}"))
    }

    pub async fn connect(
        &self,
        request: crate::ssh_client::ConnectRequest,
    ) -> Result<ConnectResult, String> {
        let handle = connect_and_auth(&request).await?;
        let primary = open_sftp_session(&handle).await?;

        let home_path = primary
            .canonicalize(".")
            .await
            .unwrap_or_else(|_| "/".to_string());

        let session_id = Uuid::new_v4().to_string();
        self.sessions.lock().await.insert(
            session_id.clone(),
            Arc::new(SftpConnection {
                handle,
                primary: Mutex::new(primary),
                transfer_permits: Arc::new(Semaphore::new(MAX_TRANSFER_CHANNELS)),
            }),
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
        let conn = self.connection(session_id).await?;
        let primary = conn.primary.lock().await;
        list_dir_entries(&primary, path).await
    }

    pub async fn create_dir(&self, session_id: &str, path: &str) -> Result<(), String> {
        let conn = self.connection(session_id).await?;
        let primary = conn.primary.lock().await;
        primary
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
        let conn = self.connection(session_id).await?;
        let primary = conn.primary.lock().await;
        let remote_path = normalize_remote_path(path);
        if is_dir {
            remove_dir_recursive(&primary, &remote_path).await
        } else {
            primary
                .remove_file(remote_path)
                .await
                .map_err(|err| format!("Could not remove file: {err}"))
        }
    }

    pub async fn download(
        &self,
        session_id: &str,
        path: &str,
        max_transfer_bytes: u64,
    ) -> Result<Vec<u8>, String> {
        validate_max_transfer_bytes(max_transfer_bytes)?;
        let conn = self.connection(session_id).await?;
        let remote_path = normalize_remote_path(path);
        self.with_transfer_session(&conn, |sftp| async move {
            let meta = sftp
                .metadata(&remote_path)
                .await
                .map_err(|err| format!("Could not read remote file metadata: {err}"))?;
            ensure_transfer_size(meta.len(), max_transfer_bytes)?;
            sftp.read(&remote_path)
                .await
                .map_err(|err| format!("Could not download file: {err}"))
        })
        .await
    }

    pub async fn upload(
        &self,
        session_id: &str,
        path: &str,
        data: Vec<u8>,
        max_transfer_bytes: u64,
    ) -> Result<(), String> {
        validate_max_transfer_bytes(max_transfer_bytes)?;
        ensure_transfer_size(data.len() as u64, max_transfer_bytes)?;
        let conn = self.connection(session_id).await?;
        let remote_path = normalize_remote_path(path);
        self.with_transfer_session(&conn, |sftp| async move {
            let mut file = sftp
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
        })
        .await
    }

    async fn with_transfer_session<F, Fut, T>(
        &self,
        conn: &SftpConnection,
        f: F,
    ) -> Result<T, String>
    where
        F: FnOnce(SftpSession) -> Fut,
        Fut: std::future::Future<Output = Result<T, String>>,
    {
        let _permit = conn
            .transfer_permits
            .acquire()
            .await
            .map_err(|err| format!("Could not acquire transfer slot: {err}"))?;
        let sftp = open_sftp_session(&conn.handle).await?;
        f(sftp).await
    }
}

async fn open_sftp_session(handle: &SshHandle) -> Result<SftpSession, String> {
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|err| format!("Could not open SSH session: {err}"))?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|err| format!("SFTP subsystem unavailable: {err}"))?;
    SftpSession::new(channel.into_stream())
        .await
        .map_err(|err| format!("SFTP handshake failed: {err}"))
}

async fn list_dir_entries(sftp: &SftpSession, path: &str) -> Result<Vec<SftpEntry>, String> {
    let remote_path = normalize_remote_path(path);
    let rows = sftp
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

fn normalize_remote_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed == "." {
        return ".".to_string();
    }
    trimmed.replace('\\', "/")
}

fn validate_max_transfer_bytes(max_bytes: u64) -> Result<(), String> {
    if max_bytes == 0 {
        return Err("Max transfer size must be greater than 0 bytes".into());
    }
    Ok(())
}

fn ensure_transfer_size(len: u64, max_bytes: u64) -> Result<(), String> {
    validate_max_transfer_bytes(max_bytes)?;
    if len > max_bytes {
        return Err(format!(
            "File exceeds the {max_bytes} byte SFTP transfer limit ({len} bytes)"
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ensure_transfer_size_rejects_over_limit() {
        let err = ensure_transfer_size(101, 100).unwrap_err();
        assert!(err.contains("101"));
        assert!(err.contains("100"));
    }

    #[test]
    fn ensure_transfer_size_accepts_within_limit() {
        ensure_transfer_size(100, 100).unwrap();
        ensure_transfer_size(0, 100).unwrap();
    }

    #[test]
    fn validate_max_transfer_bytes_rejects_zero() {
        assert!(validate_max_transfer_bytes(0).is_err());
    }
}
