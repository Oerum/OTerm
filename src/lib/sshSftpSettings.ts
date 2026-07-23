import { createPersistedSettings, setSetting } from "./settingsStore";
import {
  DEFAULT_SFTP_MAX_FILE_BYTES,
  DEFAULT_SFTP_PARALLEL_FILES,
  DEFAULT_SFTP_TRANSFER_SETTINGS,
  MAX_SFTP_PARALLEL_FILES,
  MIN_SFTP_PARALLEL_FILES,
  type SftpTransferSettings,
} from "../types/sshSftpSettings";

const STORAGE_KEY = "oterm:sftp-transfer-settings";

function clampParallel(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SFTP_PARALLEL_FILES;
  return Math.min(MAX_SFTP_PARALLEL_FILES, Math.max(MIN_SFTP_PARALLEL_FILES, Math.round(n)));
}

function parseMaxFileSizeBytes(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SFTP_MAX_FILE_BYTES;
  return Math.floor(n);
}

export function parseSftpTransferSettings(raw: string): SftpTransferSettings {
  const parsed = JSON.parse(raw) as Partial<SftpTransferSettings>;
  return {
    parallelFiles: clampParallel(parsed.parallelFiles),
    maxFileSizeBytes: parseMaxFileSizeBytes(parsed.maxFileSizeBytes),
  };
}

function defaultSettings(): SftpTransferSettings {
  return { ...DEFAULT_SFTP_TRANSFER_SETTINGS };
}

const {
  settingsRef,
  init: initSftpTransferSettings,
  setHydrated,
} = createPersistedSettings<SftpTransferSettings>({
  storageKey: STORAGE_KEY,
  defaultSettings,
  parseSettings: parseSftpTransferSettings,
});

export { initSftpTransferSettings };

export function useSftpTransferSettings() {
  function update(patch: Partial<SftpTransferSettings>) {
    settingsRef.value = { ...settingsRef.value, ...patch };
  }

  async function save(value: SftpTransferSettings): Promise<void> {
    settingsRef.value = {
      parallelFiles: clampParallel(value.parallelFiles),
      maxFileSizeBytes: parseMaxFileSizeBytes(value.maxFileSizeBytes),
    };
    setHydrated(true);
    await setSetting(STORAGE_KEY, JSON.stringify(settingsRef.value));
  }

  return { settings: settingsRef, update, save };
}
