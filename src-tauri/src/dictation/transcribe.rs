use std::path::Path;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub fn compiled_whisper_backend() -> &'static str {
    if cfg!(feature = "whisper-cuda") {
        "cuda"
    } else if cfg!(feature = "whisper-vulkan") {
        "vulkan"
    } else if cfg!(feature = "whisper-metal") {
        "metal"
    } else if cfg!(feature = "whisper-openblas") {
        "openblas"
    } else {
        "unknown"
    }
}

pub struct WhisperEngine {
    ctx: WhisperContext,
}

impl WhisperEngine {
    pub fn load(model_path: &Path) -> Result<Self, String> {
        let ctx = WhisperContext::new_with_params(
            model_path
                .to_str()
                .ok_or_else(|| "Invalid model path".to_string())?,
            WhisperContextParameters::default(),
        )
        .map_err(|err| {
            format!(
                "Failed to load Whisper model (backend: {}): {err}",
                compiled_whisper_backend()
            )
        })?;
        Ok(Self { ctx })
    }

    pub fn transcribe(&self, samples: &[f32]) -> Result<String, String> {
        if samples.is_empty() {
            return Ok(String::new());
        }

        let mut state = self
            .ctx
            .create_state()
            .map_err(|err| format!("Failed to create Whisper state: {err}"))?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_n_threads(num_cpus());
        params.set_translate(false);
        params.set_language(Some("auto"));
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        state
            .full(params, samples)
            .map_err(|err| format!("Whisper transcription failed: {err}"))?;

        Ok(collect_segment_text(&state))
    }
}

pub fn transcribe_samples(model_path: &Path, samples: &[f32]) -> Result<String, String> {
    WhisperEngine::load(model_path)?.transcribe(samples)
}

fn collect_segment_text(state: &whisper_rs::WhisperState) -> String {
    let count = state.full_n_segments();
    let mut text = String::new();
    for i in 0..count {
        let Some(segment) = state.get_segment(i) else {
            continue;
        };
        let Ok(segment_text) = segment.to_str_lossy() else {
            continue;
        };
        if !text.is_empty() && !segment_text.starts_with(' ') {
            text.push(' ');
        }
        text.push_str(segment_text.trim());
    }
    text.trim().to_string()
}

fn num_cpus() -> i32 {
    std::thread::available_parallelism()
        .map(|n| n.get().min(8) as i32)
        .unwrap_or(4)
}

#[cfg(test)]
mod backend_tests {
    use super::compiled_whisper_backend;

    #[test]
    fn compiled_backend_is_not_unknown() {
        assert_ne!(compiled_whisper_backend(), "unknown");
    }
}
