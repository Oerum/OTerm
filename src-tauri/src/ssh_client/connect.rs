use russh::client;
use russh::keys::{
    known_hosts::{check_known_hosts, learn_known_hosts},
    load_secret_key,
    Error as KeysError, HashAlg, PrivateKeyWithHashAlg, PublicKey,
};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

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

pub struct ConnectContext {
    host: String,
    port: u16,
    accept_host_key: bool,
    verdict: Mutex<Option<String>>,
}

impl ConnectContext {
    pub fn new(host: String, port: u16, accept_host_key: bool) -> Arc<Self> {
        Arc::new(Self {
            host,
            port,
            accept_host_key,
            verdict: Mutex::new(None),
        })
    }

    pub async fn take_verdict(&self) -> Option<String> {
        self.verdict.lock().await.take()
    }
}

pub struct ClientHandler {
    pub ctx: Arc<ConnectContext>,
}

impl client::Handler for ClientHandler {
    type Error = anyhow::Error;

    fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> impl std::future::Future<Output = Result<bool, Self::Error>> + Send {
        let ctx = Arc::clone(&self.ctx);
        let server_public_key = server_public_key.clone();
        async move {
            match check_known_hosts(&ctx.host, ctx.port, &server_public_key) {
                Ok(true) => Ok(true),
                Ok(false) => {
                    if ctx.accept_host_key {
                        learn_known_hosts(&ctx.host, ctx.port, &server_public_key)?;
                        Ok(true)
                    } else {
                        *ctx.verdict.lock().await = Some(host_key_error(
                            "HOST_KEY_UNKNOWN",
                            &server_public_key,
                            None,
                        ));
                        Ok(false)
                    }
                }
                Err(KeysError::KeyChanged { line }) => {
                    *ctx.verdict.lock().await = Some(host_key_error(
                        "HOST_KEY_CHANGED",
                        &server_public_key,
                        Some(format!("Host key changed (known_hosts line {line})")),
                    ));
                    Ok(false)
                }
                Err(err) => Err(anyhow::anyhow!("Host key check failed: {err}")),
            }
        }
    }
}

pub type SshHandle = client::Handle<ClientHandler>;

pub async fn connect_and_auth(request: &ConnectRequest) -> Result<SshHandle, String> {
    match tokio::time::timeout(CONNECT_TIMEOUT, connect_and_auth_inner(request)).await {
        Ok(result) => result,
        Err(_) => Err(format!(
            "Connection timed out after {} seconds",
            CONNECT_TIMEOUT.as_secs()
        )),
    }
}

async fn connect_and_auth_inner(request: &ConnectRequest) -> Result<SshHandle, String> {
    let host = request.host.trim().to_string();
    let username = request.username.trim();
    if host.is_empty() {
        return Err("Host is required".into());
    }
    if username.is_empty() {
        return Err("Username is required".into());
    }

    let ctx = ConnectContext::new(
        host.clone(),
        request.port,
        request.accept_host_key.unwrap_or(false),
    );
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
        "publicKey" | "certificate" | "fido2" => {
            let key_path = request
                .key_path
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .ok_or_else(|| "Key path is required for key-based auth".to_string())?;
            let key_file = expand_key_path(key_path);
            let key = load_secret_key(&key_file, request.key_passphrase.as_deref())
                .map_err(|err| format!("Could not load key: {err}"))?;
            handle
                .authenticate_publickey(
                    username,
                    PrivateKeyWithHashAlg::new(Arc::new(key), None),
                )
                .await
                .map_err(|err| format!("Key authentication failed: {err}"))?
        }
        "agent" => {
            return Err(
                "SSH agent authentication is not supported for integrated SSH/SFTP. \
                 Use a key file, certificate path, or password."
                    .into(),
            );
        }
        "password" => handle
            .authenticate_password(username, request.password.as_deref().unwrap_or(""))
            .await
            .map_err(|err| format!("Password authentication failed: {err}"))?,
        other => return Err(format!("Unsupported auth method: {other}")),
    };

    if !authed.success() {
        return Err("Authentication failed".into());
    }

    Ok(handle)
}

pub async fn format_connect_error(err: impl std::fmt::Display, ctx: &ConnectContext) -> String {
    if let Some(verdict) = ctx.take_verdict().await {
        return verdict;
    }
    format!("Connection failed: {err}")
}

pub fn host_key_error(code: &str, key: &PublicKey, message: Option<String>) -> String {
    serde_json::json!({
        "code": code,
        "fingerprint": format!("SHA256:{}", key.fingerprint(HashAlg::Sha256)),
        "algorithm": key.algorithm().to_string(),
        "message": message,
    })
    .to_string()
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
