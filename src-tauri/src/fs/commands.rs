use super::{context_menu, default_project_root, expand_path, list_directory, search_files};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
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
        Some(value) => expand_path(&value)?,
        None => default_project_root()?,
    };
    list_directory(&resolved)
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

fn vscode_launcher() -> PathBuf {
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let bundled = PathBuf::from(local_app_data)
            .join("Programs")
            .join("Microsoft VS Code")
            .join("bin")
            .join("code.cmd");
        if bundled.is_file() {
            return bundled;
        }
    }

    PathBuf::from(if cfg!(windows) { "code.cmd" } else { "code" })
}

fn open_in_vscode(path: &Path) -> Result<(), String> {
    let launcher = vscode_launcher();
    Command::new(&launcher)
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|err| format!("Could not launch VS Code ({launcher:?}): {err}"))
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
