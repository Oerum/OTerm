use super::{
    container_logs, prune_unused, read_summary, remove_image, remove_network, remove_volume,
    run_container_action, DockerSummary,
};

async fn blocking_docker<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn docker_summary() -> Result<DockerSummary, String> {
    blocking_docker(read_summary).await
}

#[tauri::command]
pub async fn docker_container_action(id: String, action: String) -> Result<(), String> {
    blocking_docker(move || run_container_action(id, action)).await
}

#[tauri::command]
pub async fn docker_remove_image(id: String, force: bool) -> Result<(), String> {
    blocking_docker(move || remove_image(id, force)).await
}

#[tauri::command]
pub async fn docker_remove_volume(name: String, force: bool) -> Result<(), String> {
    blocking_docker(move || remove_volume(name, force)).await
}

#[tauri::command]
pub async fn docker_remove_network(id: String) -> Result<(), String> {
    blocking_docker(move || remove_network(id)).await
}

#[tauri::command]
pub async fn docker_prune_unused(kind: String) -> Result<(), String> {
    blocking_docker(move || prune_unused(kind)).await
}

#[tauri::command]
pub async fn docker_container_logs(id: String, tail: Option<u32>) -> Result<String, String> {
    let count = tail.unwrap_or(200);
    blocking_docker(move || container_logs(id, count)).await
}
