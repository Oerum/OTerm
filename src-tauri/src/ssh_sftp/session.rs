use async_trait::async_trait;
use russh::client;
use russh::keys::{key, load_secret_key};
use russh_keys::known_hosts::learn_known_hosts;
use russh_keys::{check_known_hosts, Error as KeysError};
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::OpenFlags;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectRequest {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub password: Option<String>,
    pub key_path: Option<String>,
    pub key_passphrase: Option<String>,
    pub accept_host_key: Option<bool>,
}

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

struct ConnectContext {
    host: String,
    port: u16,
    accept_host_key: bool,
    verdict: Mutex<Option<String>>,
}

impl ConnectContext {
    fn new(host: String, port: u16, accept_host_key: bool) -> Arc<Self> {
        Arc::new(Self {
            host,
            port,
            accept_host_key,
            verdict: Mutex::new(None),
        })
    }

    async fn take_verdict(&self) -> Option<String> {
        self.verdict.lock().await.take()
    }
}

struct ClientHandler {
    ctx: Arc<ConnectContext>,
}

#[async_trait]
impl client::Handler for ClientHandler {
    type Error = anyhow::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        match check_known_hosts(&self.ctx.host, self.ctx.port, server_public_key) {
            Ok(true) => Ok(true),
            Ok(false) => {
                if self.ctx.accept_host_key {
                    learn_known_hosts(&self.ctx.host, self.ctx.port, server_public_key)?;
                    Ok(true)
                } else {
                    *self.ctx.verdict.lock().await =
                        Some(host_key_error("HOST_KEY_UNKNOWN", server_public_key, None));
                    Ok(false)
                }
            }
            Err(KeysError::KeyChanged { line }) => {
                *self.ctx.verdict.lock().await = Some(host_key_error(
                    "HOST_KEY_CHANGED",
                    server_public_key,
                    Some(format!("Host key changed (known_hosts line {line})")),
                ));
                Ok(false)
            }
            Err(err) => Err(anyhow::anyhow!("Host key check failed: {err}")),
        }
    }
}

struct SftpConnection {
    _handle: client::Handle<ClientHandler>,
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

    pub async fn connect(&self, request: ConnectRequest) -> Result<ConnectResult, String> {
        let host = request.host.trim().to_string();
        let username = request.username.trim();
        if host.is_empty() {
            return Err("Host is required".into());
        }
        if username.is_empty() {
            return Err("Username is required".into());
        }

        let ctx = ConnectContext::new(host.clone(), request.port, request.accept_host_key.unwrap_or(false));
        let config = Arc::new(client::Config::default());
        let mut handle = match client::connect(
            config,
            (host.as_str(), request.port),
            ClientHandler { ctx: ctx.clone() },
        )
        .await
        {
            Ok(handle) => handle,
            Err(err) => return Err(format_connect_error(err, &ctx).await),
        };

        let authed = match request.auth_method.as_str() {
            "publicKey" => {
                let key_path = request
                    .key_path
                    .as_deref()
                    .map(str::trim)
                    .filter(|v| !v.is_empty())
                    .ok_or_else(|| "Key path is required for public key auth".to_string())?;
                let key_file = expand_key_path(key_path);
                let key = load_secret_key(&key_file, request.key_passphrase.as_deref())
                    .map_err(|err| format!("Could not load key: {err}"))?;
                handle
                    .authenticate_publickey(username, Arc::new(key))
                    .await
                    .map_err(|err| format!("Key authentication failed: {err}"))?
            }
            _ => handle
                .authenticate_password(
                    username,
                    request.password.as_deref().unwrap_or(""),
                )
                .await
                .map_err(|err| format!("Password authentication failed: {err}"))?,
        };

        if !authed {
            return Err("Authentication failed".into());
        }

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
            conn.sftp
                .remove_dir(remote_path)
                .await
                .map_err(|err| format!("Could not remove directory: {err}"))
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
        conn.sftp
            .read(normalize_remote_path(path))
            .await
            .map_err(|err| format!("Could not download file: {err}"))
    }

    pub async fn upload(&self, session_id: &str, path: &str, data: Vec<u8>) -> Result<(), String> {
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

async fn format_connect_error(err: impl std::fmt::Display, ctx: &ConnectContext) -> String {
    if let Some(verdict) = ctx.take_verdict().await {
        return verdict;
    }
    format!("Connection failed: {err}")
}

fn host_key_error(code: &str, key: &key::PublicKey, message: Option<String>) -> String {
    serde_json::json!({
        "code": code,
        "fingerprint": format!("SHA256:{}", key.fingerprint()),
        "algorithm": key.name(),
        "message": message,
    })
    .to_string()
}

fn normalize_remote_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed == "." {
        return ".".to_string();
    }
    trimmed.replace('\\', "/")
}

fn expand_key_path(path: &str) -> PathBuf {
    let trimmed = path.trim();
    if trimmed.starts_with("~/") || trimmed == "~" {
        if let Some(home) = crate::fs::user_home() {
            if trimmed == "~" {
                return home;
            }
            let rest = trimmed.trim_start_matches("~/").trim_start_matches("~\\");
            return home.join(rest);
        }
    }
    PathBuf::from(trimmed)
}
