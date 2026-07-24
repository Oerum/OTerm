import { ref, watch, type Ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

const MIGRATION_KEYS = [
  "oterm.defaultShellId",
  "oterm:commit-ai-settings",
  "oterm:lm-settings",
  "oterm:terminal-autocomplete-settings",
  "oterm:sftp-transfer-settings",
  "oterm:source-control-width",
] as const;

const cache = new Map<string, string>();
let initPromise: Promise<void> | undefined;

export async function initSettingsStore(): Promise<void> {
  if (!initPromise) {
    initPromise = loadSettingsStore();
  }
  return initPromise;
}

async function loadSettingsStore(): Promise<void> {
  const toImport: Record<string, string> = {};
  for (const key of MIGRATION_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) {
        toImport[key] = value;
      }
    } catch {
      // ignore
    }
  }

  if (Object.keys(toImport).length > 0) {
    const imported = await invoke<number>("settings_import", { values: toImport });
    if (imported > 0) {
      for (const key of Object.keys(toImport)) {
        try {
          localStorage.removeItem(key);
        } catch {
          // ignore
        }
      }
    }
  }

  const all = await invoke<Record<string, string>>("settings_get_all");
  cache.clear();
  for (const [key, value] of Object.entries(all)) {
    cache.set(key, value);
  }
}

export function getSetting(key: string): string | null {
  return cache.get(key) ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  cache.set(key, value);
  await invoke("settings_set", { key, value });
}

export interface PersistedSettingsOptions<T> {
  storageKey: string;
  legacyStorageKey?: string;
  defaultSettings: () => T;
  parseSettings: (raw: string) => T;
  onWatch?: (value: T) => void;
}

export function createPersistedSettings<T>(options: PersistedSettingsOptions<T>): {
  settingsRef: Ref<T>;
  init: () => Promise<void>;
  setHydrated: (value: boolean) => void;
} {
  const settingsRef = ref(options.defaultSettings()) as Ref<T>;
  let hydrated = false;

  watch(
    settingsRef,
    (value) => {
      if (!hydrated) return;
      options.onWatch?.(value);
      void setSetting(options.storageKey, JSON.stringify(value));
    },
    { deep: true },
  );

  async function init() {
    try {
      const raw =
        getSetting(options.storageKey) ??
        (options.legacyStorageKey ? getSetting(options.legacyStorageKey) : null);
      settingsRef.value = raw ? options.parseSettings(raw) : options.defaultSettings();
    } catch {
      settingsRef.value = options.defaultSettings();
    } finally {
      hydrated = true;
    }
  }

  function setHydrated(value: boolean) {
    hydrated = value;
  }

  return { settingsRef, init, setHydrated };
}

