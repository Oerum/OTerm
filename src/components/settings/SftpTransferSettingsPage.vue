<script setup lang="ts">
import { computed, ref } from "vue";
import NumberStepper from "../NumberStepper.vue";
import SettingsPageFooter from "./SettingsPageFooter.vue";
import { useSftpTransferSettings } from "../../lib/sshSftpSettings";
import {
  DEFAULT_SFTP_MAX_FILE_BYTES,
  MAX_SFTP_PARALLEL_FILES,
  MIN_SFTP_PARALLEL_FILES,
  type SftpTransferSettings,
} from "../../types/sshSftpSettings";

const { settings, save } = useSftpTransferSettings();

const draft = ref<SftpTransferSettings>({ ...settings.value });
const maxFileSizeMb = ref(Math.round(settings.value.maxFileSizeBytes / (1024 * 1024)));
const saveError = ref<string | null>(null);
const saving = ref(false);
const saved = ref(false);
let savedTimer: number | undefined;

function snapshot(value: SftpTransferSettings): SftpTransferSettings {
  return {
    parallelFiles: value.parallelFiles,
    maxFileSizeBytes: value.maxFileSizeBytes,
  };
}

const dirty = computed(
  () =>
    JSON.stringify(snapshot(draft.value)) !== JSON.stringify(snapshot(settings.value)) ||
    maxFileSizeMb.value !== Math.round(settings.value.maxFileSizeBytes / (1024 * 1024)),
);

function validate(): string | null {
  if (!Number.isFinite(maxFileSizeMb.value) || maxFileSizeMb.value <= 0) {
    return "Max file size must be greater than 0 MB.";
  }
  return null;
}

async function onSave() {
  saveError.value = null;
  const error = validate();
  if (error) {
    saveError.value = error;
    return;
  }

  saving.value = true;
  try {
    const next: SftpTransferSettings = {
      parallelFiles: draft.value.parallelFiles,
      maxFileSizeBytes: Math.floor(maxFileSizeMb.value * 1024 * 1024),
    };
    await save(next);
    draft.value = { ...next };
    maxFileSizeMb.value = Math.round(next.maxFileSizeBytes / (1024 * 1024));
    saved.value = true;
    window.clearTimeout(savedTimer);
    savedTimer = window.setTimeout(() => {
      saved.value = false;
    }, 2500);
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : "Failed to save settings.";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h3 class="text-base font-medium text-[var(--oterm-text)]">SFTP transfers</h3>
      <p class="mt-1.5 text-sm leading-relaxed text-[var(--oterm-faint)]">
        Control how many files upload or download at once and the largest file size allowed per
        transfer. Files are loaded fully into memory during transfer.
      </p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="space-y-3">
        <span class="block text-xs font-medium text-[var(--oterm-muted)]">Parallel files</span>
        <NumberStepper
          v-model="draft.parallelFiles"
          :min="MIN_SFTP_PARALLEL_FILES"
          :max="MAX_SFTP_PARALLEL_FILES"
        />
        <p class="pt-0.5 text-[10px] leading-relaxed text-[var(--oterm-faint)]">
          Maximum number of files transferred simultaneously (1–1000). Some SSH servers limit open
          channels; lower this if transfers fail under load.
        </p>
      </div>
      <div class="space-y-3">
        <span class="block text-xs font-medium text-[var(--oterm-muted)]">Max file size (MB)</span>
        <input
          v-model.number="maxFileSizeMb"
          type="number"
          min="1"
          step="1"
          class="w-full rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)] px-3 py-2 text-sm text-[var(--oterm-text)] outline-none ring-[var(--oterm-accent)] focus:ring-1"
        />
        <p class="pt-0.5 text-[10px] leading-relaxed text-[var(--oterm-faint)]">
          Default is {{ Math.round(DEFAULT_SFTP_MAX_FILE_BYTES / (1024 * 1024)) }} MB. High
          parallelism with large files can use significant RAM.
        </p>
      </div>
    </div>

    <SettingsPageFooter
      :save-error="saveError"
      :saved="saved"
      :dirty="dirty"
      :saving="saving"
      @save="onSave"
    />
  </div>
</template>
