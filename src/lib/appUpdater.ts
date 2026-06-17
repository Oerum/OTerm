import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { toRaw } from "vue";
import { pushAppToast, setAppToastActivity } from "./appToast";

export type PendingAppUpdate = {
  version: string;
  body?: string;
  downloadAndInstall(onEvent?: (progress: DownloadEvent) => void): Promise<void>;
};

export type AppUpdateCheckResult =
  | { status: "available"; update: PendingAppUpdate; version: string; notes?: string }
  | { status: "uptodate" }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string };

export type AppUpdateDownloadProgress = {
  label: string;
  percent?: number;
};

function createDownloadProgressTracker() {
  let contentLength: number | undefined;
  let downloadedBytes = 0;

  return (event: DownloadEvent): AppUpdateDownloadProgress | null => {
    if (event.event === "Started") {
      contentLength = event.data.contentLength;
      downloadedBytes = 0;
      return { label: "Downloading update…" };
    }

    if (event.event === "Progress") {
      downloadedBytes += event.data.chunkLength;
      if (!contentLength || contentLength <= 0) {
        return { label: "Downloading update…" };
      }

      const percent = Math.min(100, Math.round((downloadedBytes / contentLength) * 100));
      return { label: `Downloading update… ${percent}%`, percent };
    }

    return null;
  };
}

export async function checkForAppUpdate(options?: {
  notify?: boolean;
}): Promise<AppUpdateCheckResult> {
  if (import.meta.env.DEV) {
    return {
      status: "skipped",
      reason: "Updates are not checked in development builds.",
    };
  }

  try {
    const update = await check();
    if (!update) {
      if (options?.notify) {
        pushAppToast("You're on the latest version.", "success");
      }
      return { status: "uptodate" };
    }

    return {
      status: "available",
      update,
      version: update.version,
      notes: update.body ?? undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (options?.notify) {
      pushAppToast(`Update check failed: ${message}`, "error");
    }
    return { status: "error", message };
  }
}

export async function downloadAndInstallUpdate(
  update: PendingAppUpdate,
  options?: { onProgress?: (progress: AppUpdateDownloadProgress) => void },
): Promise<boolean> {
  setAppToastActivity("Downloading update…");
  const trackProgress = createDownloadProgressTracker();
  try {
    await toRaw(update).downloadAndInstall((event) => {
      const progress = trackProgress(event);
      if (progress) {
        setAppToastActivity(progress.label);
        options?.onProgress?.(progress);
      }
    });
    pushAppToast("Update installed. Restarting…", "success");
    await relaunch();
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pushAppToast(`Update install failed: ${message}`, "error");
    return false;
  } finally {
    setAppToastActivity(null);
  }
}

export async function runStartupUpdateCheck(): Promise<void> {
  if (import.meta.env.DEV) {
    return;
  }

  const result = await checkForAppUpdate();
  if (result.status !== "available") {
    return;
  }

  pushAppToast(
    `Update ${result.version} is available. Open Settings → About to install.`,
    "info",
    15_000,
  );
}
