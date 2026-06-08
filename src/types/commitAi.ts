export type CommitAiTask = "commitMessage";

export type CommitAiProvider = "lm-studio" | "openai-compatible" | "github-copilot";

export interface CommitAiSettings {
  provider: CommitAiProvider;
  endpoint: string;
  model: string;
  apiKey: string;
  prompts: Record<CommitAiTask, string>;
}

export interface CommitAiModelInfo {
  id: string;
}

export const COMMIT_AI_PROVIDER_PRESETS: Record<
  CommitAiProvider,
  { label: string; endpoint: string; description: string }
> = {
  "lm-studio": {
    label: "LM Studio",
    endpoint: "http://localhost:1234/v1",
    description: "Local OpenAI-compatible server. No API key required.",
  },
  "openai-compatible": {
    label: "OpenAI-compatible (BYOK)",
    endpoint: "https://api.openai.com/v1",
    description: "OpenAI, OpenRouter, Azure OpenAI-compatible endpoints, vLLM, etc.",
  },
  "github-copilot": {
    label: "GitHub Copilot",
    endpoint: "https://api.githubcopilot.com",
    description:
      "Uses your Copilot subscription. Paste an OAuth token or sign in via Copilot in another editor.",
  },
};

export const DEFAULT_COMMIT_MESSAGE_PROMPT = `Commit Message Policy

All commits must follow the Conventional Commits format: <type>(<scope>): <description>.
Allowed types are: feat, fix, refactor, test, docs, chore, ci, perf.
The scope identifies the relevant area of the codebase, such as calc, tests, or ci.
The subject line must use imperative mood, be lowercase, stay under 72 characters, and must not end with a period.
Reference related GitHub issues in the footer when appropriate, for example: Closes #42.
If a commit introduces a breaking change, include a BREAKING CHANGE: section in the footer describing the impact.

Examples:
feat(calc): add modulo operation support
fix(tests): correct expected value in division-by-zero test
refactor(calc): extract validation into separate method
chore: update NuGet package dependencies`;

export const DEFAULT_COMMIT_AI_SETTINGS: CommitAiSettings = {
  provider: "lm-studio",
  endpoint: COMMIT_AI_PROVIDER_PRESETS["lm-studio"].endpoint,
  model: "",
  apiKey: "",
  prompts: {
    commitMessage: DEFAULT_COMMIT_MESSAGE_PROMPT,
  },
};

export function isCommitAiConfigured(settings: CommitAiSettings): boolean {
  if (!settings.endpoint.trim() || !settings.model.trim()) return false;
  if (settings.provider === "openai-compatible" && !settings.apiKey.trim()) return false;
  return true;
}

export function commitAiProviderLabel(provider: CommitAiProvider): string {
  return COMMIT_AI_PROVIDER_PRESETS[provider].label;
}
