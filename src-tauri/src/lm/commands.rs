use super::{
    chat_completion, list_models, load_github_copilot_oauth_token, normalize_endpoint, AiProvider,
};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LmModelInfo {
    pub id: String,
}

#[tauri::command]
pub async fn lm_list_models(
    endpoint: String,
    provider: Option<String>,
    api_key: Option<String>,
) -> Result<Vec<LmModelInfo>, String> {
    let provider = AiProvider::parse(provider.as_deref());
    let models = list_models(&endpoint, provider, api_key.as_deref()).await?;
    Ok(models.into_iter().map(|id| LmModelInfo { id }).collect())
}

#[tauri::command]
pub async fn lm_test_connection(
    endpoint: String,
    provider: Option<String>,
    api_key: Option<String>,
) -> Result<String, String> {
    let provider = AiProvider::parse(provider.as_deref());
    let base = normalize_endpoint(&endpoint)?;
    let models = list_models(&base, provider, api_key.as_deref()).await?;
    if models.is_empty() {
        return Ok("Connected, but no models are available".into());
    }
    Ok(format!("Connected. {} model(s) available.", models.len()))
}

#[tauri::command]
pub async fn lm_detect_github_copilot_token() -> Result<Option<String>, String> {
    Ok(load_github_copilot_oauth_token())
}

#[tauri::command]
pub async fn lm_chat_completion(
    endpoint: String,
    provider: Option<String>,
    model: String,
    system_prompt: String,
    user_prompt: String,
    api_key: Option<String>,
) -> Result<String, String> {
    let provider = AiProvider::parse(provider.as_deref());
    chat_completion(
        &endpoint,
        provider,
        api_key.as_deref(),
        &model,
        &system_prompt,
        &user_prompt,
    )
    .await
}
