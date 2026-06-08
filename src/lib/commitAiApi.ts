import { invoke } from "@tauri-apps/api/core";
import type { CommitAiModelInfo, CommitAiProvider } from "../types/commitAi";

export function listCommitAiModels(
  endpoint: string,
  provider: CommitAiProvider,
  apiKey?: string,
): Promise<CommitAiModelInfo[]> {
  return invoke<CommitAiModelInfo[]>("lm_list_models", {
    endpoint,
    provider,
    apiKey: apiKey?.trim() || null,
  });
}

export function testCommitAiConnection(
  endpoint: string,
  provider: CommitAiProvider,
  apiKey?: string,
): Promise<string> {
  return invoke<string>("lm_test_connection", {
    endpoint,
    provider,
    apiKey: apiKey?.trim() || null,
  });
}

export function detectGithubCopilotToken(): Promise<string | null> {
  return invoke<string | null>("lm_detect_github_copilot_token");
}

export function generateCommitAiCompletion(
  endpoint: string,
  provider: CommitAiProvider,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  apiKey?: string,
): Promise<string> {
  return invoke<string>("lm_chat_completion", {
    endpoint,
    provider,
    model,
    systemPrompt,
    userPrompt,
    apiKey: apiKey?.trim() || null,
  });
}
