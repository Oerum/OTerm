pub mod commands;

use serde::Deserialize;

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
}

const COMMIT_TYPES: &[&str] = &["feat", "fix", "refactor", "test", "docs", "chore", "ci", "perf"];

fn extract_completion_text(message: ChatMessage) -> Option<String> {
    let content = message.content.unwrap_or_default();
    let trimmed = content.trim();
    if !trimmed.is_empty() {
        return Some(trimmed.to_string());
    }

    let reasoning = message.reasoning_content.unwrap_or_default();
    let reasoning = reasoning.trim();
    if reasoning.is_empty() {
        return None;
    }

    extract_conventional_commit_line(reasoning).or_else(|| Some(reasoning.to_string()))
}

fn extract_conventional_commit_line(text: &str) -> Option<String> {
    text.lines()
        .filter_map(|line| {
            let cleaned = line
                .trim()
                .trim_start_matches(|c: char| c == '*' || c == '-' || c == ' ' || c == '`')
                .trim_end_matches('`')
                .trim();
            if looks_like_commit_subject(cleaned) {
                Some(cleaned.to_string())
            } else {
                None
            }
        })
        .last()
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

pub(crate) async fn list_models(endpoint: &str) -> Result<Vec<String>, String> {
    let base = normalize_endpoint(endpoint)?;
    let url = format!("{base}/models");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|err| err.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|err| format!("Could not reach LM Studio at {url}: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("LM Studio returned {status}: {body}"));
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

pub(crate) async fn chat_completion(
    endpoint: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String, String> {
    let base = normalize_endpoint(endpoint)?;
    let model = model.trim();
    if model.is_empty() {
        return Err("Model is required".into());
    }

    let url = format!("{base}/chat/completions");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|err| err.to_string())?;

    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ],
        "temperature": 0.2,
        "max_tokens": 1024,
        "stream": false
    });

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|err| format!("Could not reach LM Studio at {url}: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("LM Studio returned {status}: {body}"));
    }

    let payload: ChatCompletionResponse = response
        .json()
        .await
        .map_err(|err| format!("Invalid chat completion response: {err}"))?;

    let content = payload
        .choices
        .into_iter()
        .next()
        .and_then(|choice| extract_completion_text(choice.message));

    match content {
        Some(text) if !text.is_empty() => Ok(text),
        _ => Err(
            "LM Studio returned an empty completion. Try a non-reasoning model or reduce staged diff size."
                .into(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_content_over_reasoning() {
        let text = extract_completion_text(ChatMessage {
            content: Some("feat: add widget".into()),
            reasoning_content: Some("thinking...".into()),
        });
        assert_eq!(text.as_deref(), Some("feat: add widget"));
    }

    #[test]
    fn extracts_commit_subject_from_reasoning() {
        let reasoning = r#"
* analyzing changes
* `feat(core): add lm studio integration`
* Wait, is it just
"#;
        let text = extract_completion_text(ChatMessage {
            content: Some(String::new()),
            reasoning_content: Some(reasoning.into()),
        });
        assert_eq!(
            text.as_deref(),
            Some("feat(core): add lm studio integration")
        );
    }
}
