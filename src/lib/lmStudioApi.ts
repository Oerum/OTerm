import { invoke } from "@tauri-apps/api/core";
import type { LmModelInfo } from "../types/lm";

export function listLmModels(endpoint: string): Promise<LmModelInfo[]> {
  return invoke<LmModelInfo[]>("lm_list_models", { endpoint });
}

export function testLmConnection(endpoint: string): Promise<string> {
  return invoke<string>("lm_test_connection", { endpoint });
}

export function generateLmCompletion(
  endpoint: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  return invoke<string>("lm_chat_completion", {
    endpoint,
    model,
    systemPrompt,
    userPrompt,
  });
}
