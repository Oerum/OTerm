use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::dictation::capture::RecordingHandle;
use crate::dictation::model::{download_model, ensure_model_installed, model_status};
use crate::dictation::transcribe::{transcribe_samples, WhisperEngine};
use crate::dictation::wav::write_mono_wav;
use crate::dictation::{
    model_path, recordings_dir, resample_mono, LIVE_MIN_SAMPLES, LIVE_TRANSCRIBE_INTERVAL_SECS,
    MODEL_FILE_NAME, WHISPER_SAMPLE_RATE,
};

pub struct DictationManager {
    recording: Mutex<Option<RecordingHandle>>,
    transcribing: AtomicBool,
    live_stop: Mutex<Option<Arc<AtomicBool>>>,
    live_thread: Mutex<Option<JoinHandle<()>>>,
}

impl DictationManager {
    pub fn new() -> Self {
        Self {
            recording: Mutex::new(None),
            transcribing: AtomicBool::new(false),
            live_stop: Mutex::new(None),
            live_thread: Mutex::new(None),
        }
    }

    pub fn status(&self) -> DictationStatus {
        let path = model_path().unwrap_or_default();
        let (model_installed, model_path) = model_status(&path);
        DictationStatus {
            model_installed,
            model_name: MODEL_FILE_NAME.to_string(),
            model_path,
            recording: self.is_recording(),
            transcribing: self.transcribing.load(Ordering::SeqCst),
        }
    }

    pub fn is_recording(&self) -> bool {
        self.recording
            .lock()
            .map(|guard| guard.is_some())
            .unwrap_or(false)
    }

    pub fn start_recording(&self, app: AppHandle) -> Result<(), String> {
        if self.transcribing.load(Ordering::SeqCst) {
            return Err("Transcription is already in progress".to_string());
        }

        ensure_model_installed()?;

        let mut guard = self
            .recording
            .lock()
            .map_err(|_| "Recording state lock poisoned".to_string())?;

        if guard.is_some() {
            return Err("Recording is already in progress".to_string());
        }

        let handle = RecordingHandle::start()?;
        let (samples, sample_rate) = handle.sample_source();
        self.start_live_loop(app, samples, sample_rate)?;
        *guard = Some(handle);
        Ok(())
    }

    pub fn cancel_recording(&self) -> Result<(), String> {
        self.stop_live_loop();
        let mut guard = self
            .recording
            .lock()
            .map_err(|_| "Recording state lock poisoned".to_string())?;
        if let Some(handle) = guard.take() {
            let _ = handle.stop();
        }
        Ok(())
    }

    pub fn stop_and_transcribe(&self) -> Result<String, String> {
        if self.transcribing.swap(true, Ordering::SeqCst) {
            return Err("Transcription is already in progress".to_string());
        }

        let result = (|| {
            self.stop_live_loop();

            let handle = {
                let mut guard = self
                    .recording
                    .lock()
                    .map_err(|_| "Recording state lock poisoned".to_string())?;
                guard
                    .take()
                    .ok_or_else(|| "No active recording to transcribe".to_string())?
            };

            let samples = handle.stop()?;
            if samples.is_empty() {
                return Ok(String::new());
            }

            let wav_path = recordings_dir()?.join(format!("{}.wav", Uuid::new_v4()));
            write_mono_wav(&wav_path, &samples)?;

            let text = transcribe_samples(&model_path()?, &samples);

            let _ = std::fs::remove_file(&wav_path);
            text
        })();

        self.transcribing.store(false, Ordering::SeqCst);
        result
    }

    pub async fn download_model(&self, app: tauri::AppHandle) -> Result<(), String> {
        if self.is_recording() {
            return Err("Stop recording before downloading the model".to_string());
        }
        download_model(app).await
    }

    fn start_live_loop(
        &self,
        app: AppHandle,
        samples: Arc<Mutex<Vec<f32>>>,
        sample_rate: u32,
    ) -> Result<(), String> {
        self.stop_live_loop();

        let stop = Arc::new(AtomicBool::new(false));
        let stop_flag = Arc::clone(&stop);
        let path = model_path()?;

        let thread = thread::Builder::new()
            .name("dictation-live".into())
            .spawn(move || run_live_transcribe_loop(app, samples, sample_rate, stop_flag, path))
            .map_err(|err| format!("Failed to start live transcription thread: {err}"))?;

        *self
            .live_stop
            .lock()
            .map_err(|_| "Live stop lock poisoned".to_string())? = Some(stop);
        *self
            .live_thread
            .lock()
            .map_err(|_| "Live thread lock poisoned".to_string())? = Some(thread);
        Ok(())
    }

    fn stop_live_loop(&self) {
        if let Ok(mut guard) = self.live_stop.lock() {
            if let Some(stop) = guard.take() {
                stop.store(true, Ordering::SeqCst);
            }
        }
        if let Ok(mut guard) = self.live_thread.lock() {
            if let Some(thread) = guard.take() {
                let _ = thread.join();
            }
        }
    }
}

fn run_live_transcribe_loop(
    app: AppHandle,
    samples: Arc<Mutex<Vec<f32>>>,
    sample_rate: u32,
    stop: Arc<AtomicBool>,
    model_path: std::path::PathBuf,
) {
    let engine = match WhisperEngine::load(&model_path) {
        Ok(engine) => engine,
        Err(err) => {
            eprintln!("oterm: live dictation model load failed: {err}");
            return;
        }
    };

    let mut last_text = String::new();
    while !stop.load(Ordering::SeqCst) {
        thread::sleep(Duration::from_secs(LIVE_TRANSCRIBE_INTERVAL_SECS));
        if stop.load(Ordering::SeqCst) {
            break;
        }

        let resampled = {
            let Ok(guard) = samples.lock() else {
                continue;
            };
            resample_mono(&guard, sample_rate, WHISPER_SAMPLE_RATE)
        };

        if resampled.len() < LIVE_MIN_SAMPLES {
            continue;
        }

        let Ok(text) = engine.transcribe(&resampled) else {
            continue;
        };

        if text == last_text {
            continue;
        }
        last_text = text.clone();
        let _ = app.emit("dictation-live-partial", DictationLivePartialEvent { text });
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationStatus {
    pub model_installed: bool,
    pub model_name: String,
    pub model_path: Option<String>,
    pub recording: bool,
    pub transcribing: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationTranscriptionResult {
    pub text: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DictationLivePartialEvent {
    text: String,
}
