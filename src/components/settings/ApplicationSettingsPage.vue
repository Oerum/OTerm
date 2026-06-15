<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getVersion } from "@tauri-apps/api/app";
import {
  checkForAppUpdate,
  downloadAndInstallUpdate,
  type PendingAppUpdate,
} from "../../lib/appUpdater";

const version = ref("");
const checking = ref(false);
const installing = ref(false);
const statusMessage = ref<string | null>(null);
const pendingUpdate = ref<PendingAppUpdate | null>(null);

onMounted(() => {
  void getVersion()
    .then((value) => {
      version.value = value;
    })
    .catch((err) => {
      console.error("Failed to load app version:", err);
    });
});

async function onCheck() {
  checking.value = true;
  statusMessage.value = null;
  pendingUpdate.value = null;

  try {
    const result = await checkForAppUpdate();
    if (result.status === "available") {
      pendingUpdate.value = result.update;
      statusMessage.value = `Version ${result.version} is available.`;
      return;
    }
    if (result.status === "uptodate") {
      statusMessage.value = "You're on the latest version.";
      return;
    }
    if (result.status === "skipped") {
      statusMessage.value = result.reason;
      return;
    }
    if (result.status === "error") {
      statusMessage.value = result.message;
    }
  } finally {
    checking.value = false;
  }
}

async function onInstall() {
  if (!pendingUpdate.value) {
    return;
  }

  installing.value = true;
  try {
    await downloadAndInstallUpdate(pendingUpdate.value);
  } finally {
    installing.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h3 class="text-base font-medium text-[var(--oterm-text)]">Application</h3>
      <p class="mt-1.5 text-sm leading-relaxed text-[var(--oterm-faint)]">
        Check for signed updates published on GitHub Releases. Installed builds restart
        automatically after an update is downloaded.
      </p>
    </div>

    <div class="space-y-3 rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-sidebar)] p-4">
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-xs font-medium text-[var(--oterm-muted)]">Current version</span>
        <span class="font-mono text-sm text-[var(--oterm-text)]">{{ version || "…" }}</span>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs text-[var(--oterm-text)] transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="checking || installing"
          @click="onCheck"
        >
          {{ checking ? "Checking…" : "Check for updates" }}
        </button>
        <button
          v-if="pendingUpdate"
          type="button"
          class="rounded-md bg-[var(--oterm-accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="installing"
          @click="onInstall"
        >
          {{ installing ? "Installing…" : "Download and restart" }}
        </button>
      </div>

      <p v-if="statusMessage" class="text-xs leading-relaxed text-[var(--oterm-muted)]">
        {{ statusMessage }}
      </p>
    </div>
  </div>
</template>
