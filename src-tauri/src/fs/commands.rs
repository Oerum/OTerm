use super::{
    composer_attachments_dir, context_menu, create_directory, default_project_root, expand_path,
    find_devenv_launcher, find_env_import_hint, find_rider_launcher, find_vscode_launcher,
    find_zed_launcher, import_env_file, list_directory, list_solution_files, open_in_rider,
    open_in_system_file_explorer, open_in_visual_studio, open_in_vscode, open_in_zed,
    read_file_bytes, remove_path, search_files, system_file_explorer_label, user_home,
    write_file_bytes,
};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEnvImportHint {
    pub source_path: String,
    pub target_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsToolsDirectoryHints {
    pub visual_studio_available: bool,
    pub rider_available: bool,
    pub vscode_available: bool,
    pub zed_available: bool,
    pub file_explorer_label: String,
    pub solution_files: Vec<String>,
    pub env_import: Option<FsEnvImportHint>,
}

pub struct FsSearchState {
    generation: AtomicU64,
}

impl FsSearchState {
    pub fn new() -> Self {
        Self {
            generation: AtomicU64::new(0),
        }
    }

    fn begin_search(&self) -> u64 {
        self.generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    fn is_cancelled(&self, token: u64) -> bool {
        self.generation.load(Ordering::SeqCst) != token
    }
}

#[tauri::command]
pub fn fs_list_directory(path: Option<String>) -> Result<Vec<FsEntry>, String> {
    let resolved = match path {
        Some(value) if !value.trim().is_empty() => expand_path(&value)?,
        _ => default_project_root()?,
    };
    list_directory(&resolved)
}

#[tauri::command]
pub fn fs_user_home() -> Result<String, String> {
    user_home()
        .map(|path| path.to_string_lossy().into_owned())
        .ok_or_else(|| "Home directory not found".to_string())
}

#[tauri::command]
pub fn fs_read_file(path: String) -> Result<Vec<u8>, String> {
    let resolved = expand_path(&path)?;
    read_file_bytes(&resolved)
}

#[tauri::command]
pub fn fs_write_file(path: String, data: Vec<u8>) -> Result<(), String> {
    let resolved = expand_path(&path)?;
    write_file_bytes(&resolved, &data)
}

#[tauri::command]
pub fn fs_create_dir(path: String) -> Result<(), String> {
    let resolved = expand_path(&path)?;
    create_directory(&resolved)
}

#[tauri::command]
pub fn fs_remove_path(path: String, is_dir: bool) -> Result<(), String> {
    let resolved = expand_path(&path)?;
    remove_path(&resolved, is_dir)
}

#[tauri::command]
pub async fn fs_search_files(
    search_state: State<'_, Arc<FsSearchState>>,
    root: Option<String>,
    query: String,
) -> Result<Vec<FsEntry>, String> {
    let resolved = match root {
        Some(value) => expand_path(&value)?,
        None => default_project_root()?,
    };

    let worker = Arc::clone(search_state.inner());
    let token = worker.begin_search();

    tauri::async_runtime::spawn_blocking(move || {
        search_files(&resolved, &query, || worker.is_cancelled(token))
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
pub fn fs_tools_directory_hints(directory: String) -> Result<FsToolsDirectoryHints, String> {
    let resolved = expand_path(&directory)?;
    if !resolved.is_dir() {
        return Err(format!("Not a directory: {}", resolved.display()));
    }

    let visual_studio_available = find_devenv_launcher().is_some();
    let rider_available = find_rider_launcher().is_some();
    let vscode_available = find_vscode_launcher().is_some();
    let zed_available = find_zed_launcher().is_some();
    let solution_files = list_solution_files(&resolved)?
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect();

    let env_import = find_env_import_hint(&resolved).map(|(source, target)| FsEnvImportHint {
        source_path: source.to_string_lossy().into_owned(),
        target_path: target.to_string_lossy().into_owned(),
    });

    Ok(FsToolsDirectoryHints {
        visual_studio_available,
        rider_available,
        vscode_available,
        zed_available,
        file_explorer_label: system_file_explorer_label().to_string(),
        solution_files,
        env_import,
    })
}

#[tauri::command]
pub async fn fs_open_in_visual_studio(solution_path: String) -> Result<(), String> {
    let resolved = expand_path(&solution_path)?;

    tauri::async_runtime::spawn_blocking(move || open_in_visual_studio(&resolved))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn fs_open_in_rider(solution_path: String) -> Result<(), String> {
    let resolved = expand_path(&solution_path)?;

    tauri::async_runtime::spawn_blocking(move || open_in_rider(&resolved))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub fn fs_import_env_file(directory: String) -> Result<FsEnvImportHint, String> {
    let resolved = expand_path(&directory)?;
    let (source, target) = import_env_file(&resolved)?;

    Ok(FsEnvImportHint {
        source_path: source.to_string_lossy().into_owned(),
        target_path: target.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub async fn fs_open_in_vscode(path: String) -> Result<(), String> {
    let resolved = expand_path(&path)?;
    if !resolved.is_dir() {
        return Err(format!("Not a directory: {}", resolved.display()));
    }

    tauri::async_runtime::spawn_blocking(move || open_in_vscode(&resolved))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn fs_open_in_zed(path: String) -> Result<(), String> {
    let resolved = expand_path(&path)?;
    if !resolved.is_dir() {
        return Err(format!("Not a directory: {}", resolved.display()));
    }

    tauri::async_runtime::spawn_blocking(move || open_in_zed(&resolved))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn fs_open_in_file_explorer(path: String) -> Result<(), String> {
    let resolved = expand_path(&path)?;
    if !resolved.is_dir() {
        return Err(format!("Not a directory: {}", resolved.display()));
    }

    tauri::async_runtime::spawn_blocking(move || open_in_system_file_explorer(&resolved))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub fn fs_write_temp_attachment(data: Vec<u8>, extension: String) -> Result<String, String> {
    const ALLOWED: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp"];
    const MAX_BYTES: usize = 20 * 1024 * 1024;
    let ext = extension.trim().trim_start_matches('.').to_lowercase();
    if !ALLOWED.contains(&ext.as_str()) {
        return Err(format!("Unsupported attachment extension: {ext}"));
    }
    if data.is_empty() {
        return Err("Attachment data is empty".to_string());
    }
    if data.len() > MAX_BYTES {
        return Err(format!(
            "Attachment exceeds {MAX_BYTES} byte limit ({} bytes)",
            data.len()
        ));
    }

    let temp_root = composer_attachments_dir();
    std::fs::create_dir_all(&temp_root).map_err(|err| err.to_string())?;

    let file_name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let path = temp_root.join(file_name);
    std::fs::write(&path, &data).map_err(|err| err.to_string())?;

    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn fs_show_shell_context_menu(
    window: tauri::WebviewWindow,
    path: String,
    x: i32,
    y: i32,
) -> Result<(), String> {
    let resolved = expand_path(&path)?;

    #[cfg(windows)]
    let owner = window.hwnd().ok().map(|hwnd| hwnd.0 as isize);

    #[cfg(not(windows))]
    let owner = None::<isize>;

    tauri::async_runtime::spawn_blocking(move || {
        context_menu::show_shell_context_menu(&resolved, x, y, owner)
    })
    .await
    .map_err(|err| err.to_string())?
}
