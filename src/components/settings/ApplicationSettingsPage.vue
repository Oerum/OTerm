<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { getName, getVersion } from "@tauri-apps/api/app";
import { openUrl } from "../../lib/secureOpenUrl";
import MarkdownContent from "../MarkdownContent.vue";
import {
  checkForAppUpdate,
  downloadAndInstallUpdate,
  type PendingAppUpdate,
} from "../../lib/appUpdater";
import { getSetting, setSetting } from "../../lib/settingsStore";

const GITHUB_REPO_URL = "https://github.com/Oerum/OTerm";
const RELEASES_URL = "https://github.com/Oerum/OTerm/releases";

type UpdateUiState =
  | "idle"
  | "checking"
  | "uptodate"
  | "available"
  | "downloading"
  | "error"
  | "skipped";

const appName = ref("OTerm");
const version = ref("");
const updateState = ref<UpdateUiState>("idle");
const statusMessage = ref<string | null>(null);
const pendingUpdate = shallowRef<PendingAppUpdate | null>(null);
const releaseNotes = ref<string | null>(null);
const availableVersion = ref<string | null>(null);
const lastCheckedAt = ref<Date | null>(null);
const downloadPercent = ref<number | null>(null);
const isDevBuild = import.meta.env.DEV;

const promptDefaultBranchPush = ref(getSetting("oterm.promptDefaultBranchPush") !== "false");

watch(promptDefaultBranchPush, (val) => {
  void setSetting("oterm.promptDefaultBranchPush", val ? "true" : "false");
});

const statusTone = computed(() => {
  if (updateState.value === "available") return "accent";
  if (updateState.value === "uptodate") return "success";
  if (updateState.value === "error") return "danger";
  if (updateState.value === "skipped") return "muted";
  return "neutral";
});

const statusLabel = computed(() => {
  switch (updateState.value) {
    case "checking":
      return "Checking for updates…";
    case "uptodate":
      return "Up to date";
    case "available":
      return "Update available";
    case "downloading":
      return "Downloading update";
    case "error":
      return "Update check failed";
    case "skipped":
      return "Updates unavailable";
    default:
      return "Not checked yet";
  }
});

const lastCheckedLabel = computed(() => {
  if (!lastCheckedAt.value) {
    return null;
  }
  return lastCheckedAt.value.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
});

const checking = computed(() => updateState.value === "checking");
const installing = computed(() => updateState.value === "downloading");

onMounted(() => {
  void getName()
    .then((value) => {
      appName.value = value;
    })
    .catch((err) => {
      console.error("Failed to load app name:", err);
    });

  void getVersion()
    .then((value) => {
      version.value = value;
    })
    .catch((err) => {
      console.error("Failed to load app version:", err);
    });

  if (!isDevBuild) {
    void onCheck({ silent: true });
  } else {
    updateState.value = "skipped";
    statusMessage.value = "Updates are not checked in development builds.";
  }
});

async function onCheck(options?: { silent?: boolean }) {
  updateState.value = "checking";
  statusMessage.value = null;
  pendingUpdate.value = null;
  releaseNotes.value = null;
  availableVersion.value = null;
  downloadPercent.value = null;

  try {
    const result = await checkForAppUpdate();
    lastCheckedAt.value = new Date();

    if (result.status === "available") {
      pendingUpdate.value = result.update;
      availableVersion.value = result.version;
      releaseNotes.value = result.notes?.trim() || null;
      updateState.value = "available";
      statusMessage.value = options?.silent
        ? `Version ${result.version} is available.`
        : `Version ${result.version} is ready to install.`;
      return;
    }

    if (result.status === "uptodate") {
      updateState.value = "uptodate";
      statusMessage.value = options?.silent
        ? null
        : "You're on the latest version.";
      return;
    }

    if (result.status === "skipped") {
      updateState.value = "skipped";
      statusMessage.value = result.reason;
      return;
    }

    if (result.status === "error") {
      updateState.value = "error";
      statusMessage.value = result.message;
    }
  } catch (err) {
    updateState.value = "error";
    statusMessage.value = err instanceof Error ? err.message : String(err);
  }
}

async function onInstall() {
  if (!pendingUpdate.value) {
    return;
  }

  updateState.value = "downloading";
  downloadPercent.value = 0;
  statusMessage.value = "Downloading update. The app will restart when finished.";

  try {
    const installed = await downloadAndInstallUpdate(pendingUpdate.value, {
      onProgress: (progress) => {
        downloadPercent.value = progress.percent ?? null;
        statusMessage.value = progress.label;
      },
    });
    if (!installed) {
      updateState.value = "available";
      statusMessage.value = "Update install failed. Try again or download from GitHub Releases.";
    }
  } finally {
    downloadPercent.value = null;
    if (updateState.value === "downloading") {
      updateState.value = pendingUpdate.value ? "available" : "idle";
    }
  }
}

async function openExternal(url: string) {
  try {
    await openUrl(url);
  } catch (err) {
    console.error("Failed to open URL:", err);
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h3 class="text-base font-medium text-[var(--oterm-text)]">About</h3>
      <p class="mt-1.5 text-sm leading-relaxed text-[var(--oterm-faint)]">
        Version information and signed updates from GitHub Releases.
      </p>
    </div>

    <div
      class="rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-sidebar)] p-5"
    >
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-lg font-medium text-[var(--oterm-text)]">{{ appName }}</p>
          <p class="mt-1 font-mono text-sm text-[var(--oterm-muted)]">
            Version {{ version || "…" }}
          </p>
          <p class="mt-2 text-[10px] uppercase tracking-wide text-[var(--oterm-faint)]">
            Licensed under AGPL-3.0-or-later
          </p>
        </div>

        <span
          class="rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide"
          :class="{
            'bg-[var(--oterm-accent-dim)] text-[var(--oterm-accent)]': statusTone === 'accent',
            'bg-emerald-500/10 text-emerald-400': statusTone === 'success',
            'bg-red-500/10 text-red-400': statusTone === 'danger',
            'bg-white/5 text-[var(--oterm-muted)]':
              statusTone === 'muted' || statusTone === 'neutral',
          }"
        >
          {{ statusLabel }}
        </span>
      </div>
    </div>

    <div class="space-y-4 rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-sidebar)] p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-xs font-medium text-[var(--oterm-text)]">Software updates</p>
          <p v-if="lastCheckedLabel" class="mt-1 text-[10px] text-[var(--oterm-faint)]">
            Last checked {{ lastCheckedLabel }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs text-[var(--oterm-text)] transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="checking || installing"
            @click="onCheck()"
          >
            {{ checking ? "Checking…" : "Check for updates" }}
          </button>
          <button
            v-if="pendingUpdate"
            type="button"
            class="rounded-md bg-[var(--oterm-accent)] px-3 py-1.5 text-xs font-medium text-[var(--oterm-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="installing"
            @click="onInstall"
          >
            {{ installing ? "Installing…" : `Install v${availableVersion}` }}
          </button>
        </div>
      </div>

      <div
        v-if="installing && downloadPercent !== null"
        class="space-y-1.5"
        aria-live="polite"
      >
        <div class="h-1.5 overflow-hidden rounded-full bg-white/5">
          <div
            class="h-full rounded-full bg-[var(--oterm-accent)] transition-[width] duration-150"
            :style="{ width: `${downloadPercent}%` }"
          />
        </div>
        <p class="text-[10px] text-[var(--oterm-faint)]">{{ downloadPercent }}%</p>
      </div>

      <p v-if="statusMessage" class="text-xs leading-relaxed text-[var(--oterm-muted)]">
        {{ statusMessage }}
      </p>

      <div
        v-if="pendingUpdate && availableVersion"
        class="space-y-2 rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/40 p-3"
      >
        <p class="text-xs font-medium text-[var(--oterm-text)]">
          What's new in v{{ availableVersion }}
        </p>
        <div class="max-h-48 overflow-y-auto pr-1">
          <MarkdownContent
            v-if="releaseNotes"
            :source="releaseNotes"
            empty-text="No release notes were published for this version."
          />
          <p v-else class="text-xs text-[var(--oterm-faint)]">
            No release notes were published for this version.
          </p>
        </div>
      </div>
    </div>

    <div class="space-y-4 rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-sidebar)] p-4">
      <div>
        <p class="text-xs font-medium text-[var(--oterm-text)]">Source Control</p>
        <p class="mt-1 text-[10px] text-[var(--oterm-faint)]">
          Configure safety warnings for git actions.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <input
          id="prompt-default-branch"
          v-model="promptDefaultBranchPush"
          type="checkbox"
          class="h-4 w-4 rounded border-[var(--oterm-border)] bg-transparent text-[var(--oterm-accent)] focus:ring-[var(--oterm-accent)]"
        />
        <label for="prompt-default-branch" class="text-xs text-[var(--oterm-text)]">
          Prompt before pushing to default branches (main, master)
        </label>
      </div>
    </div>

    <div class="space-y-2">
      <p class="text-xs font-medium text-[var(--oterm-muted)]">Links</p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs text-[var(--oterm-text)] transition hover:bg-white/5"
          @click="openExternal(RELEASES_URL)"
        >
          View releases
        </button>
        <button
          type="button"
          class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs text-[var(--oterm-text)] transition hover:bg-white/5"
          @click="openExternal(GITHUB_REPO_URL)"
        >
          GitHub repository
        </button>
      </div>
    </div>
  </div>
</template>
