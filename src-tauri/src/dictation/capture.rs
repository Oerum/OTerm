use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample, Stream};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};

use crate::dictation::{resample_mono, MAX_RECORDING_SECONDS, WHISPER_SAMPLE_RATE};

pub struct RecordingHandle {
    samples: Arc<Mutex<Vec<f32>>>,
    sample_rate: u32,
    stop_tx: mpsc::Sender<()>,
    thread: Option<JoinHandle<()>>,
}

impl RecordingHandle {
    pub fn start() -> Result<Self, String> {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| "No microphone input device found".to_string())?;

        let config = device
            .default_input_config()
            .map_err(|err| format!("Failed to read microphone config: {err}"))?;

        let sample_rate = config.sample_rate().0;
        let channels = config.channels() as usize;
        let sample_format = config.sample_format();
        let max_samples = (WHISPER_SAMPLE_RATE as u64)
            .saturating_mul(MAX_RECORDING_SECONDS)
            .saturating_mul(channels.max(1) as u64) as usize;

        let samples: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
        let buffer = Arc::clone(&samples);
        let (stop_tx, stop_rx) = mpsc::channel();

        let stream_config: cpal::StreamConfig = config.into();
        let thread = thread::Builder::new()
            .name("dictation-capture".into())
            .spawn(move || {
                let stream = match sample_format {
                    SampleFormat::F32 => {
                        build_stream::<f32>(&device, &stream_config, buffer, channels, max_samples)
                    }
                    SampleFormat::I16 => {
                        build_stream::<i16>(&device, &stream_config, buffer, channels, max_samples)
                    }
                    SampleFormat::U16 => {
                        build_stream::<u16>(&device, &stream_config, buffer, channels, max_samples)
                    }
                    other => Err(format!("Unsupported microphone sample format: {other:?}")),
                };

                let Ok(stream) = stream else {
                    eprintln!("oterm: failed to open microphone stream");
                    return;
                };

                if let Err(err) = stream.play() {
                    eprintln!("oterm: failed to start microphone: {err}");
                    return;
                }

                let _ = stop_rx.recv();
                drop(stream);
            })
            .map_err(|err| format!("Failed to start capture thread: {err}"))?;

        Ok(Self {
            samples,
            sample_rate,
            stop_tx,
            thread: Some(thread),
        })
    }

    pub fn sample_source(&self) -> (Arc<Mutex<Vec<f32>>>, u32) {
        (Arc::clone(&self.samples), self.sample_rate)
    }

    pub fn stop(mut self) -> Result<Vec<f32>, String> {
        let _ = self.stop_tx.send(());
        if let Some(thread) = self.thread.take() {
            thread
                .join()
                .map_err(|_| "Capture thread panicked".to_string())?;
        }

        let raw = self
            .samples
            .lock()
            .map_err(|_| "Recording buffer lock poisoned".to_string())?
            .clone();

        Ok(resample_mono(&raw, self.sample_rate, WHISPER_SAMPLE_RATE))
    }
}

fn build_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    buffer: Arc<Mutex<Vec<f32>>>,
    channels: usize,
    max_samples: usize,
) -> Result<Stream, String>
where
    T: Sample + SizedSample,
    f32: FromSample<T>,
{
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                if let Ok(mut guard) = buffer.lock() {
                    if guard.len() >= max_samples {
                        return;
                    }
                    for frame in data.chunks(channels.max(1)) {
                        let mono = frame
                            .iter()
                            .map(|sample| f32::from_sample(*sample))
                            .sum::<f32>()
                            / channels.max(1) as f32;
                        guard.push(mono);
                        if guard.len() >= max_samples {
                            break;
                        }
                    }
                }
            },
            move |err| {
                eprintln!("oterm: microphone stream error: {err}");
            },
            None,
        )
        .map_err(|err| format!("Failed to open microphone stream: {err}"))
}
