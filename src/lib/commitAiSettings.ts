import { ref, watch } from "vue";
import {
  COMMIT_AI_PROVIDER_PRESETS,
  DEFAULT_COMMIT_AI_SETTINGS,
  type CommitAiProvider,
  type CommitAiSettings,
} from "../types/commitAi";

const STORAGE_KEY = "oterm:commit-ai-settings";
const LEGACY_STORAGE_KEY = "oterm:lm-settings";

function normalizeProvider(value: unknown): CommitAiProvider {
  if (value === "openai-compatible" || value === "github-copilot") return value;
  return "lm-studio";
}

function load(): CommitAiSettings {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_COMMIT_AI_SETTINGS,
        prompts: { ...DEFAULT_COMMIT_AI_SETTINGS.prompts },
      };
    }
    const parsed = JSON.parse(raw) as Partial<CommitAiSettings> & {
      endpoint?: string;
      model?: string;
    };
    const provider = normalizeProvider(parsed.provider);
    const preset = COMMIT_AI_PROVIDER_PRESETS[provider];
    return {
      provider,
      endpoint: parsed.endpoint?.trim() || preset.endpoint,
      model: parsed.model?.trim() ?? "",
      apiKey: parsed.apiKey?.trim() ?? "",
      prompts: {
        commitMessage:
          parsed.prompts?.commitMessage?.trim() ||
          DEFAULT_COMMIT_AI_SETTINGS.prompts.commitMessage,
      },
    };
  } catch {
    return {
      ...DEFAULT_COMMIT_AI_SETTINGS,
      prompts: { ...DEFAULT_COMMIT_AI_SETTINGS.prompts },
    };
  }
}

function save(settings: CommitAiSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

const settingsRef = ref<CommitAiSettings>(load());

watch(
  settingsRef,
  (value) => {
    save(value);
  },
  { deep: true },
);

export function useCommitAiSettings() {
  function update(patch: Partial<CommitAiSettings>) {
    settingsRef.value = {
      ...settingsRef.value,
      ...patch,
      prompts: {
        ...settingsRef.value.prompts,
        ...patch.prompts,
      },
    };
  }

  function setProvider(provider: CommitAiProvider) {
    const preset = COMMIT_AI_PROVIDER_PRESETS[provider];
    settingsRef.value = {
      ...settingsRef.value,
      provider,
      endpoint: preset.endpoint,
    };
  }

  function resetPrompts() {
    settingsRef.value = {
      ...settingsRef.value,
      prompts: { ...DEFAULT_COMMIT_AI_SETTINGS.prompts },
    };
  }

  return {
    settings: settingsRef,
    update,
    setProvider,
    resetPrompts,
  };
}
