use super::{kill_process, list_processes, ProcessListSummary};

async fn blocking_process<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn process_manager_list() -> Result<ProcessListSummary, String> {
    blocking_process(|| Ok(list_processes())).await
}

#[tauri::command]
pub async fn process_manager_kill(pid: u32) -> Result<(), String> {
    blocking_process(move || kill_process(pid)).await
}
