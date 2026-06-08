use super::{chat_completion, list_models, normalize_endpoint};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LmModelInfo {
    pub id: String,
}

#[tauri::command]
pub async fn lm_list_models(endpoint: String) -> Result<Vec<LmModelInfo>, String> {
    let models = list_models(&endpoint).await?;
    Ok(models.into_iter().map(|id| LmModelInfo { id }).collect())
}

#[tauri::command]
pub async fn lm_test_connection(endpoint: String) -> Result<String, String> {
    let base = normalize_endpoint(&endpoint)?;
    let models = list_models(&base).await?;
    if models.is_empty() {
        return Ok("Connected, but no models are available".into());
    }
    Ok(format!("Connected. {} model(s) available.", models.len()))
}

#[tauri::command]
pub async fn lm_chat_completion(
    endpoint: String,
    model: String,
    system_prompt: String,
    user_prompt: String,
) -> Result<String, String> {
    chat_completion(&endpoint, &model, &system_prompt, &user_prompt).await
}
