import { ref, watch } from "vue";
import { DEFAULT_LM_SETTINGS, type LmSettings } from "../types/lm";

const STORAGE_KEY = "oterm:lm-settings";

function load(): LmSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LM_SETTINGS, prompts: { ...DEFAULT_LM_SETTINGS.prompts } };
    const parsed = JSON.parse(raw) as Partial<LmSettings>;
    return {
      endpoint: parsed.endpoint?.trim() || DEFAULT_LM_SETTINGS.endpoint,
      model: parsed.model?.trim() ?? "",
      prompts: {
        commitMessage:
          parsed.prompts?.commitMessage?.trim() || DEFAULT_LM_SETTINGS.prompts.commitMessage,
      },
    };
  } catch {
    return { ...DEFAULT_LM_SETTINGS, prompts: { ...DEFAULT_LM_SETTINGS.prompts } };
  }
}

function save(settings: LmSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

const settingsRef = ref<LmSettings>(load());

watch(
  settingsRef,
  (value) => {
    save(value);
  },
  { deep: true },
);

export function useLmSettings() {
  function update(patch: Partial<LmSettings>) {
    settingsRef.value = {
      ...settingsRef.value,
      ...patch,
      prompts: {
        ...settingsRef.value.prompts,
        ...patch.prompts,
      },
    };
  }

  function resetPrompts() {
    settingsRef.value = {
      ...settingsRef.value,
      prompts: { ...DEFAULT_LM_SETTINGS.prompts },
    };
  }

  return {
    settings: settingsRef,
    update,
    resetPrompts,
  };
}
