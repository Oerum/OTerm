pub mod commands;

mod capture;
mod manager;
mod model;
mod transcribe;
mod wav;

pub use manager::DictationManager;

pub const WHISPER_SAMPLE_RATE: u32 = 16_000;
pub const MODEL_FILE_NAME: &str = "ggml-tiny.bin";
/// Expected size from Hugging Face ggml-tiny.bin (bytes); used to detect corrupt downloads.
pub const MODEL_EXPECTED_BYTES: u64 = 70_000_000;
pub const MAX_RECORDING_SECONDS: u64 = 300;
pub const LIVE_TRANSCRIBE_INTERVAL_SECS: u64 = 2;
/// Minimum resampled audio (~1s at 16 kHz) before running live transcription.
pub const LIVE_MIN_SAMPLES: usize = WHISPER_SAMPLE_RATE as usize;

pub fn models_dir() -> Result<std::path::PathBuf, String> {
    Ok(crate::settings::settings_dir()?.join("whisper-models"))
}

pub fn model_path() -> Result<std::path::PathBuf, String> {
    Ok(models_dir()?.join(MODEL_FILE_NAME))
}

pub fn recordings_dir() -> Result<std::path::PathBuf, String> {
    let dir = crate::settings::settings_dir()?
        .join("dictation")
        .join("recordings");
    std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

pub fn model_is_valid(path: &std::path::Path) -> bool {
    path.is_file()
        && std::fs::metadata(path)
            .map(|meta| meta.len() >= MODEL_EXPECTED_BYTES.saturating_sub(1024))
            .unwrap_or(false)
}

/// Linear resample mono f32 PCM to the target sample rate.
pub fn resample_mono(input: &[f32], input_rate: u32, output_rate: u32) -> Vec<f32> {
    if input.is_empty() || input_rate == 0 || output_rate == 0 {
        return Vec::new();
    }
    if input_rate == output_rate {
        return input.to_vec();
    }

    let ratio = input_rate as f64 / output_rate as f64;
    let output_len = ((input.len() as f64) / ratio).ceil() as usize;
    let mut output = Vec::with_capacity(output_len);

    for i in 0..output_len {
        let src_pos = i as f64 * ratio;
        let idx = src_pos.floor() as usize;
        let frac = (src_pos - idx as f64) as f32;
        let a = input.get(idx).copied().unwrap_or(0.0);
        let b = input.get(idx + 1).copied().unwrap_or(a);
        output.push(a + (b - a) * frac);
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resample_halves_sample_count_for_half_rate() {
        let input: Vec<f32> = (0..480).map(|i| i as f32).collect();
        let output = resample_mono(&input, 48_000, 16_000);
        assert_eq!(output.len(), 160);
    }

    #[test]
    fn resample_same_rate_is_copy() {
        let input = vec![0.1, 0.2, 0.3];
        let output = resample_mono(&input, 16_000, 16_000);
        assert_eq!(output, input);
    }
}
