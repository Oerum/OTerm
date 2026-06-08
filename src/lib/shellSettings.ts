import { getSetting, setSetting } from "./settingsStore";

const STORAGE_KEY = "oterm.defaultShellId";

export function loadDefaultShellId(fallback: string): string {
  const raw = getSetting(STORAGE_KEY);
  return raw && raw.length > 0 ? raw : fallback;
}

export function saveDefaultShellId(shellId: string) {
  void setSetting(STORAGE_KEY, shellId);
}
