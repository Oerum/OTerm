use super::{
    chat_completion, list_models, load_github_copilot_oauth_token, normalize_endpoint, AiProvider,
    ChatCompletionRequest, CompletionMode,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LmModelInfo {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LmChatCompletionRequest {
    pub endpoint: String,
    pub provider: Option<String>,
    pub model: String,
    pub system_prompt: String,
    pub user_prompt: String,
    pub api_key: Option<String>,
    pub use_reasoning: Option<bool>,
    pub allow_tool_calls: Option<bool>,
    pub completion_mode: Option<String>,
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
pub async fn lm_chat_completion(request: LmChatCompletionRequest) -> Result<String, String> {
    let provider = AiProvider::parse(request.provider.as_deref());
    let mode = CompletionMode::parse(request.completion_mode.as_deref());
    let use_reasoning = request
        .use_reasoning
        .unwrap_or(mode == CompletionMode::Commit);
    let allow_tool_calls = request
        .allow_tool_calls
        .unwrap_or(mode == CompletionMode::Commit);
    chat_completion(ChatCompletionRequest {
        endpoint: &request.endpoint,
        provider,
        api_key: request.api_key.as_deref(),
        model: &request.model,
        system_prompt: &request.system_prompt,
        user_prompt: &request.user_prompt,
        use_reasoning,
        allow_tool_calls,
        mode,
    })
    .await
}
