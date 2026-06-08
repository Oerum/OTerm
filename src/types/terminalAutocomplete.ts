import type { CommitAiProvider } from "./commitAi";

export const DEFAULT_TERMINAL_AUTOCOMPLETE_SYSTEM_PROMPT = `You suggest the next shell command for a terminal user.
Return only the command text with no explanation, markdown, or quotes.
Prefer safe, concrete follow-up commands based on recent command output.
If unsure, return an empty response.`;

export interface TerminalAutocompleteSettings {
  enabled: boolean;
  provider: CommitAiProvider;
  endpoint: string;
  model: string;
  apiKey: string;
  commandContextCount: number;
  responseContextCount: number;
  systemPrompt: string;
  enableReasoning: boolean;
  enableToolCalls: boolean;
}

export interface TerminalCommandExchange {
  command: string;
  response: string;
}

export const DEFAULT_TERMINAL_AUTOCOMPLETE_SETTINGS: TerminalAutocompleteSettings = {
  enabled: false,
  provider: "lm-studio",
  endpoint: "http://localhost:1234/v1",
  model: "",
  apiKey: "",
  commandContextCount: 15,
  responseContextCount: 15,
  systemPrompt: DEFAULT_TERMINAL_AUTOCOMPLETE_SYSTEM_PROMPT,
  enableReasoning: false,
  enableToolCalls: false,
};

export function isTerminalAutocompleteConfigured(
  settings: TerminalAutocompleteSettings,
): boolean {
  if (!settings.endpoint.trim() || !settings.model.trim()) return false;
  if (settings.provider === "openai-compatible" && !settings.apiKey.trim()) return false;
  return true;
}
