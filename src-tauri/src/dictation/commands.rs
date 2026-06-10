use super::manager::{DictationManager, DictationStatus, DictationTranscriptionResult};
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn dictation_get_status(manager: State<'_, Arc<DictationManager>>) -> DictationStatus {
    manager.status()
}

#[tauri::command]
pub async fn dictation_download_model(
    app: AppHandle,
    manager: State<'_, Arc<DictationManager>>,
) -> Result<(), String> {
    manager.download_model(app).await
}

#[tauri::command]
pub fn dictation_start_recording(
    app: AppHandle,
    manager: State<'_, Arc<DictationManager>>,
) -> Result<(), String> {
    manager.start_recording(app)
}

#[tauri::command]
pub fn dictation_cancel_recording(manager: State<'_, Arc<DictationManager>>) -> Result<(), String> {
    manager.cancel_recording()
}

#[tauri::command]
pub async fn dictation_stop_and_transcribe(
    manager: State<'_, Arc<DictationManager>>,
) -> Result<DictationTranscriptionResult, String> {
    let manager = Arc::clone(manager.inner());
    let text = tauri::async_runtime::spawn_blocking(move || manager.stop_and_transcribe())
        .await
        .map_err(|err| format!("Transcription task failed: {err}"))??;

    Ok(DictationTranscriptionResult { text })
}
