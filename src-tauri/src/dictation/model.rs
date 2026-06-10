use crate::dictation::{
    model_is_valid, model_path, models_dir, MODEL_EXPECTED_BYTES, MODEL_FILE_NAME,
};
use futures_util::StreamExt;
use std::path::Path;
use tauri::{AppHandle, Emitter};

const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin";

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDownloadProgressEvent {
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
}

pub fn ensure_model_installed() -> Result<(), String> {
    let path = model_path()?;
    if model_is_valid(&path) {
        return Ok(());
    }
    if path.exists() {
        let _ = std::fs::remove_file(&path);
    }
    Err(format!(
        "Whisper model {MODEL_FILE_NAME} is not installed. Download it before recording."
    ))
}

pub async fn download_model(app: AppHandle) -> Result<(), String> {
    let dir = models_dir()?;
    std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let dest = model_path()?;

    if model_is_valid(&dest) {
        let _ = app.emit(
            "dictation-model-download-progress",
            ModelDownloadProgressEvent {
                downloaded_bytes: MODEL_EXPECTED_BYTES,
                total_bytes: Some(MODEL_EXPECTED_BYTES),
            },
        );
        return Ok(());
    }

    if dest.exists() {
        std::fs::remove_file(&dest).map_err(|err| err.to_string())?;
    }

    let temp_path = dest.with_extension("bin.part");
    if temp_path.exists() {
        let _ = std::fs::remove_file(&temp_path);
    }

    let client = reqwest::Client::new();
    let response = client
        .get(MODEL_URL)
        .send()
        .await
        .map_err(|err| format!("Model download failed: {err}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Model download failed with status {}",
            response.status()
        ));
    }

    let total_bytes = response.content_length();
    let mut downloaded: u64 = 0;
    let mut file = std::fs::File::create(&temp_path).map_err(|err| err.to_string())?;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|err| format!("Model download stream error: {err}"))?;
        use std::io::Write;
        file.write_all(&chunk).map_err(|err| err.to_string())?;
        downloaded += chunk.len() as u64;
        let _ = app.emit(
            "dictation-model-download-progress",
            ModelDownloadProgressEvent {
                downloaded_bytes: downloaded,
                total_bytes,
            },
        );
    }

    if !model_is_valid(&temp_path) {
        let _ = std::fs::remove_file(&temp_path);
        return Err(format!(
            "Downloaded model file is invalid (expected at least {} bytes)",
            MODEL_EXPECTED_BYTES
        ));
    }

    std::fs::rename(&temp_path, &dest).map_err(|err| err.to_string())?;
    Ok(())
}

pub fn model_status(path: &Path) -> (bool, Option<String>) {
    if model_is_valid(path) {
        return (true, Some(path.to_string_lossy().into_owned()));
    }
    (false, None)
}
