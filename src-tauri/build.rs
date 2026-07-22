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
        0 => {
            println!("cargo:warning=No Whisper backend feature enabled. Using stub/mock mode for testing.");
        }
        1 => {}
        _ => panic!("Multiple Whisper backend features enabled ({enabled:?}). Enable exactly one."),
    }
}
