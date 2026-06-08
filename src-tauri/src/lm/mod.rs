pub mod commands;

use std::path::PathBuf;

use serde::Deserialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AiProvider {
    LmStudio,
    OpenAiCompatible,
    GithubCopilot,
}

impl AiProvider {
    fn parse(value: Option<&str>) -> Self {
        match value.unwrap_or("lm-studio") {
            "openai-compatible" => Self::OpenAiCompatible,
            "github-copilot" => Self::GithubCopilot,
            _ => Self::LmStudio,
        }
    }
}

#[derive(Debug, Deserialize)]
struct ModelsResponse {
    data: Option<Vec<ModelEntry>>,
}

#[derive(Debug, Deserialize)]
struct ModelEntry {
    id: String,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: Option<String>,
    reasoning_content: Option<String>,
    tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Debug, Deserialize)]
struct ToolCall {
    function: Option<ToolFunction>,
}

#[derive(Debug, Deserialize)]
struct ToolFunction {
    arguments: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CompletionMode {
    Commit,
    Terminal,
}

impl CompletionMode {
    fn parse(value: Option<&str>) -> Self {
        match value {
            Some("terminal") => Self::Terminal,
            _ => Self::Commit,
        }
    }
}

const COMMIT_TYPES: &[&str] = &["feat", "fix", "refactor", "test", "docs", "chore", "ci", "perf"];

fn extract_tool_call_text(message: &ChatMessage) -> Option<String> {
    message
        .tool_calls
        .as_ref()?
        .iter()
        .find_map(|call| {
            call.function
                .as_ref()?
                .arguments
                .as_deref()
                .map(str::trim)
                .filter(|args| !args.is_empty())
                .map(str::to_string)
        })
}

fn extract_completion_text(
    message: ChatMessage,
    use_reasoning: bool,
    allow_tool_calls: bool,
    mode: CompletionMode,
) -> Option<String> {
    if let Some(content) = message
        .content
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        return Some(content.to_string());
    }

    if allow_tool_calls {
        if let Some(text) = extract_tool_call_text(&message) {
            return Some(text);
        }
    }

    if !use_reasoning {
        return None;
    }

    let reasoning = message.reasoning_content.unwrap_or_default();
    let reasoning = reasoning.trim();
    if reasoning.is_empty() {
        return None;
    }

    match mode {
        CompletionMode::Commit => {
            extract_conventional_commit_line(reasoning).or_else(|| Some(reasoning.to_string()))
        }
        CompletionMode::Terminal => reasoning
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .map(str::to_string),
    }
}

fn extract_conventional_commit_line(text: &str) -> Option<String> {
    text.lines()
        .filter_map(|line| {
            let cleaned = line
                .trim()
                .trim_start_matches(['*', '-', ' ', '`'])
                .trim_end_matches('`')
                .trim();
            if looks_like_commit_subject(cleaned) {
                Some(cleaned.to_string())
            } else {
                None
            }
        })
        .next_back()
}

fn looks_like_commit_subject(line: &str) -> bool {
    COMMIT_TYPES.iter().any(|commit_type| {
        line.starts_with(&format!("{commit_type}:"))
            || line.starts_with(&format!("{commit_type}("))
    })
}

pub(crate) fn normalize_endpoint(endpoint: &str) -> Result<String, String> {
    let trimmed = endpoint.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Endpoint is required".into());
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("Endpoint must start with http:// or https://".into());
    }
    Ok(trimmed.to_string())
}

fn copilot_apps_json_path() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("LOCALAPPDATA")
            .map(|dir| PathBuf::from(dir).join("github-copilot").join("apps.json"))
    }
    #[cfg(not(windows))]
    {
        std::env::var_os("HOME").map(|dir| {
            PathBuf::from(dir)
                .join(".config")
                .join("github-copilot")
                .join("apps.json")
        })
    }
}

pub(crate) fn load_github_copilot_oauth_token() -> Option<String> {
    let path = copilot_apps_json_path()?;
    let content = std::fs::read_to_string(path).ok()?;
    let apps: serde_json::Value = serde_json::from_str(&content).ok()?;
    let entries = apps.as_object()?;
    for value in entries.values() {
        if let Some(token) = value.get("oauth_token").and_then(|token| token.as_str()) {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn resolve_api_key(provider: AiProvider, api_key: Option<&str>) -> Result<Option<String>, String> {
    if let Some(key) = api_key.map(str::trim).filter(|key| !key.is_empty()) {
        return Ok(Some(key.to_string()));
    }

    if provider == AiProvider::GithubCopilot {
        if let Some(token) = load_github_copilot_oauth_token() {
            return Ok(Some(token));
        }
        return Err(
            "GitHub Copilot token not found. Paste an OAuth token or sign in via Copilot in another editor."
                .into(),
        );
    }

    if provider == AiProvider::OpenAiCompatible {
        return Err("API key is required for OpenAI-compatible providers.".into());
    }

    Ok(None)
}

fn apply_provider_headers(
    builder: reqwest::RequestBuilder,
    provider: AiProvider,
    api_key: Option<&str>,
) -> reqwest::RequestBuilder {
    let mut builder = builder.header("Content-Type", "application/json");
    if let Some(key) = api_key.filter(|key| !key.is_empty()) {
        builder = builder.header("Authorization", format!("Bearer {key}"));
    }
    if provider == AiProvider::GithubCopilot {
        builder = builder
            .header("Copilot-Integration-Id", "vscode-chat")
            .header("Editor-Version", "oterm/0.1.0");
    }
    builder
}

pub(crate) async fn list_models(
    endpoint: &str,
    provider: AiProvider,
    api_key: Option<&str>,
) -> Result<Vec<String>, String> {
    let base = normalize_endpoint(endpoint)?;
    let api_key = resolve_api_key(provider, api_key)?;
    let url = format!("{base}/models");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|err| err.to_string())?;

    let request = apply_provider_headers(client.get(&url), provider, api_key.as_deref());
    let response = request
        .send()
        .await
        .map_err(|err| format!("Could not reach provider at {url}: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Provider returned {status}: {body}"));
    }

    let payload: ModelsResponse = response
        .json()
        .await
        .map_err(|err| format!("Invalid models response: {err}"))?;

    let mut ids: Vec<String> = payload
        .data
        .unwrap_or_default()
        .into_iter()
        .map(|entry| entry.id)
        .filter(|id| !id.is_empty())
        .collect();
    ids.sort();
    ids.dedup();
    Ok(ids)
}

pub(crate) struct ChatCompletionRequest<'a> {
    pub endpoint: &'a str,
    pub provider: AiProvider,
    pub api_key: Option<&'a str>,
    pub model: &'a str,
    pub system_prompt: &'a str,
    pub user_prompt: &'a str,
    pub use_reasoning: bool,
    pub allow_tool_calls: bool,
    pub mode: CompletionMode,
}

pub(crate) async fn chat_completion(req: ChatCompletionRequest<'_>) -> Result<String, String> {
    let ChatCompletionRequest {
        endpoint,
        provider,
        api_key,
        model,
        system_prompt,
        user_prompt,
        use_reasoning,
        allow_tool_calls,
        mode,
    } = req;
    let base = normalize_endpoint(endpoint)?;
    let api_key = resolve_api_key(provider, api_key)?;
    let model = model.trim();
    if model.is_empty() {
        return Err("Model is required".into());
    }

    let url = format!("{base}/chat/completions");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|err| err.to_string())?;

    let mut body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ],
        "temperature": 0.2,
        "max_tokens": 1024,
        "stream": false
    });
    if !allow_tool_calls {
        body["tool_choice"] = serde_json::json!("none");
    }

    let request = apply_provider_headers(client.post(&url), provider, api_key.as_deref()).json(&body);
    let response = request
        .send()
        .await
        .map_err(|err| format!("Could not reach provider at {url}: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Provider returned {status}: {body}"));
    }

    let payload: ChatCompletionResponse = response
        .json()
        .await
        .map_err(|err| format!("Invalid chat completion response: {err}"))?;

    let content = payload
        .choices
        .into_iter()
        .next()
        .and_then(|choice| {
            extract_completion_text(
                choice.message,
                use_reasoning,
                allow_tool_calls,
                mode,
            )
        });

    match content {
        Some(text) if !text.is_empty() => Ok(text),
        _ => Err(
            "Provider returned an empty completion. Try a non-reasoning model or reduce staged diff size."
                .into(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_content_over_reasoning() {
        let text = extract_completion_text(
            ChatMessage {
                content: Some("feat: add widget".into()),
                reasoning_content: Some("thinking...".into()),
                tool_calls: None,
            },
            true,
            false,
            CompletionMode::Commit,
        );
        assert_eq!(text.as_deref(), Some("feat: add widget"));
    }

    #[test]
    fn extracts_commit_subject_from_reasoning() {
        let reasoning = r#"
* analyzing changes
* `feat(core): add lm studio integration`
* Wait, is it just
"#;
        let text = extract_completion_text(
            ChatMessage {
                content: Some(String::new()),
                reasoning_content: Some(reasoning.into()),
                tool_calls: None,
            },
            true,
            false,
            CompletionMode::Commit,
        );
        assert_eq!(
            text.as_deref(),
            Some("feat(core): add lm studio integration")
        );
    }

    #[test]
    fn terminal_reasoning_uses_first_nonempty_line() {
        let text = extract_completion_text(
            ChatMessage {
                content: Some(String::new()),
                reasoning_content: Some("\n\ngit status\n".into()),
                tool_calls: None,
            },
            true,
            false,
            CompletionMode::Terminal,
        );
        assert_eq!(text.as_deref(), Some("git status"));
    }
}
