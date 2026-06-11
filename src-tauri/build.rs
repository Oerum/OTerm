fn main() {
    validate_whisper_backend_features();
    tauri_build::build();
}

fn validate_whisper_backend_features() {
    const BACKENDS: &[&str] = &[
        "CARGO_FEATURE_WHISPER_METAL",
        "CARGO_FEATURE_WHISPER_VULKAN",
        "CARGO_FEATURE_WHISPER_CUDA",
        "CARGO_FEATURE_WHISPER_OPENBLAS",
    ];

    let enabled: Vec<&str> = BACKENDS
        .iter()
        .copied()
        .filter(|name| std::env::var(name).is_ok())
        .collect();

    match enabled.len() {
        0 => panic!(
            "No Whisper backend feature enabled. Pass one of: \
             --features whisper-metal | whisper-vulkan | whisper-cuda | whisper-openblas"
        ),
        1 => {}
        _ => panic!("Multiple Whisper backend features enabled ({enabled:?}). Enable exactly one."),
    }
}
