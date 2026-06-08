import { ref, watch } from "vue";
import { COMMIT_AI_PROVIDER_PRESETS } from "../types/commitAi";
import type { CommitAiProvider } from "../types/commitAi";
import {
  DEFAULT_TERMINAL_AUTOCOMPLETE_SETTINGS,
  DEFAULT_TERMINAL_AUTOCOMPLETE_SYSTEM_PROMPT,
  type TerminalAutocompleteSettings,
} from "../types/terminalAutocomplete";
import { getSetting, setSetting } from "./settingsStore";

const STORAGE_KEY = "oterm:terminal-autocomplete-settings";

function normalizeProvider(value: unknown): CommitAiProvider {
  if (value === "openai-compatible" || value === "github-copilot") return value;
  return "lm-studio";
}

function clampCount(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(50, Math.max(1, Math.round(n)));
}

function parseSettings(raw: string): TerminalAutocompleteSettings {
  const parsed = JSON.parse(raw) as Partial<TerminalAutocompleteSettings>;
  const provider = normalizeProvider(parsed.provider);
  const preset = COMMIT_AI_PROVIDER_PRESETS[provider];
  return {
    enabled: Boolean(parsed.enabled),
    provider,
    endpoint: parsed.endpoint?.trim() || preset.endpoint,
    model: parsed.model?.trim() ?? "",
    apiKey: parsed.apiKey?.trim() ?? "",
    commandContextCount: clampCount(parsed.commandContextCount, 15),
    responseContextCount: clampCount(parsed.responseContextCount, 15),
    systemPrompt:
      parsed.systemPrompt?.trim() || DEFAULT_TERMINAL_AUTOCOMPLETE_SYSTEM_PROMPT,
    enableReasoning: Boolean(parsed.enableReasoning),
    enableToolCalls: Boolean(parsed.enableToolCalls),
  };
}

function defaultSettings(): TerminalAutocompleteSettings {
  return { ...DEFAULT_TERMINAL_AUTOCOMPLETE_SETTINGS };
}

const settingsRef = ref<TerminalAutocompleteSettings>(defaultSettings());
let hydrated = false;

watch(
  settingsRef,
  (value) => {
    if (!hydrated) return;
    void setSetting(STORAGE_KEY, JSON.stringify(value));
  },
  { deep: true },
);

export async function initTerminalAutocompleteSettings() {
  try {
    const raw = getSetting(STORAGE_KEY);
    settingsRef.value = raw ? parseSettings(raw) : defaultSettings();
  } catch {
    settingsRef.value = defaultSettings();
  } finally {
    hydrated = true;
  }
}

export function useTerminalAutocompleteSettings() {
  function update(patch: Partial<TerminalAutocompleteSettings>) {
    settingsRef.value = { ...settingsRef.value, ...patch };
  }

  async function save(value: TerminalAutocompleteSettings): Promise<void> {
    settingsRef.value = { ...value };
    if (!hydrated) hydrated = true;
    await setSetting(STORAGE_KEY, JSON.stringify(settingsRef.value));
  }

  return { settings: settingsRef, update, save };
}
