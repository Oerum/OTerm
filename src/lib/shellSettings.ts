const STORAGE_KEY = "oterm.defaultShellId";

export function loadDefaultShellId(fallback: string): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw && raw.length > 0 ? raw : fallback;
  } catch {
    return fallback;
  }
}

export function saveDefaultShellId(shellId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, shellId);
  } catch {
    // ignore
  }
}
