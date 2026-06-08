import { getSetting, setSetting } from "./settingsStore";
import type { SshCategory, SshEndpoint, SshSftpLibrary } from "../types/sshSftp";

const STORAGE_KEY = "oterm:ssh-sftp-library";

const emptyLibrary = (): SshSftpLibrary => ({
  categories: [],
  endpoints: [],
});

export function loadSshSftpLibrary(): SshSftpLibrary {
  const raw = getSetting(STORAGE_KEY);
  if (!raw) return emptyLibrary();
  try {
    const parsed = JSON.parse(raw) as SshSftpLibrary;
    return {
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      endpoints: Array.isArray(parsed.endpoints) ? parsed.endpoints : [],
    };
  } catch {
    return emptyLibrary();
  }
}

export function saveSshSftpLibrary(library: SshSftpLibrary): void {
  void setSetting(STORAGE_KEY, JSON.stringify(library));
}

let nextId = 1;
export function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${nextId++}`;
}

export function sortCategories(categories: SshCategory[]) {
  return [...categories].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function endpointsInCategory(endpoints: SshEndpoint[], categoryId: string | null) {
  return endpoints
    .filter((e) => e.categoryId === categoryId)
    .sort((a, b) => a.name.localeCompare(b.name));
}
