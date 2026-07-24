use crate::lm::commands::{lm_chat_completion, LmChatCompletionRequest};

pub async fn run_ai_preflight(
    repo_root: String,
    endpoint: String,
    provider: Option<String>,
    api_key: Option<String>,
    model: String,
) -> Result<String, String> {
    let diff = crate::git::resolve_staged_diff(repo_root)?;
    if diff.diff.trim().is_empty() {
        return Ok("No staged changes to analyze.".into());
    }

    let req = LmChatCompletionRequest {
        endpoint,
        provider,
        model,
        system_prompt: "You are an expert code reviewer. Review the following git diff and identify potential bugs, security issues, and style violations. Keep your feedback concise.".into(),
        user_prompt: diff.diff,
        api_key,
        use_reasoning: Some(false),
        allow_tool_calls: Some(false),
        completion_mode: Some("chat".into()),
    };

    lm_chat_completion(req).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_ai_preflight_empty() {
        let dir = std::env::temp_dir().join(format!(
            "ai_preflight_{}",
            std::time::UNIX_EPOCH.elapsed().unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        std::process::Command::new("git")
            .arg("init")
            .current_dir(&dir)
            .output()
            .unwrap();

        let result = run_ai_preflight(
            dir.to_string_lossy().into_owned(),
            "http://localhost".into(),
            None,
            None,
            "model".into(),
        )
        .await;

        assert_eq!(result, Ok("No staged changes to analyze.".into()));
    }
}
