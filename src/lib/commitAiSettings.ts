import { ref, watch } from "vue";
import {
  COMMIT_AI_PROVIDER_PRESETS,
  DEFAULT_COMMIT_AI_SETTINGS,
  type CommitAiProvider,
  type CommitAiSettings,
} from "../types/commitAi";
import { getSetting, setSetting } from "./settingsStore";

const STORAGE_KEY = "oterm:commit-ai-settings";
const LEGACY_STORAGE_KEY = "oterm:lm-settings";

function normalizeProvider(value: unknown): CommitAiProvider {
  if (value === "openai-compatible" || value === "github-copilot") return value;
  return "lm-studio";
}

function parseSettings(raw: string): CommitAiSettings {
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
}

function defaultSettings(): CommitAiSettings {
  return {
    ...DEFAULT_COMMIT_AI_SETTINGS,
    prompts: { ...DEFAULT_COMMIT_AI_SETTINGS.prompts },
  };
}

const settingsRef = ref<CommitAiSettings>(defaultSettings());
let hydrated = false;

watch(
  settingsRef,
  (value) => {
    if (!hydrated) return;
    void setSetting(STORAGE_KEY, JSON.stringify(value));
  },
  { deep: true },
);

export async function initCommitAiSettings() {
  try {
    const raw = getSetting(STORAGE_KEY) ?? getSetting(LEGACY_STORAGE_KEY);
    settingsRef.value = raw ? parseSettings(raw) : defaultSettings();
  } catch {
    settingsRef.value = defaultSettings();
  } finally {
    hydrated = true;
  }
}

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
