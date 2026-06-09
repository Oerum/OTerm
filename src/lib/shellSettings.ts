import { getSetting, setSetting } from "./settingsStore";

export const DEFAULT_SHELL_SETTING_KEY = "oterm.defaultShellId";
const STORAGE_KEY = DEFAULT_SHELL_SETTING_KEY;

export function loadDefaultShellId(fallback: string): string {
  const raw = getSetting(STORAGE_KEY);
  return raw && raw.length > 0 ? raw : fallback;
}

export function saveDefaultShellId(shellId: string) {
  void setSetting(STORAGE_KEY, shellId);
}
