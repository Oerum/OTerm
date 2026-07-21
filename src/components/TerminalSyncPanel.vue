<template>
  <div class="terminal-sync-panel flex h-full min-h-0 flex-col gap-5 p-4">
    <div class="flex flex-col gap-2.5">
      <label class="text-[11px] font-semibold uppercase tracking-[0.08em] text-(--oterm-faint)">
        GUI State
      </label>
      <input
        v-model="inputGuiState"
        @keyup.enter="handlePushGuiState"
        class="rounded-md border border-(--oterm-border) bg-(--oterm-bg)/70 px-2.5 py-2 text-xs text-(--oterm-text) outline-none transition duration-150 placeholder:text-(--oterm-faint) focus:border-[var(--oterm-accent)]/35 focus:ring-1 focus:ring-[var(--oterm-accent)]/15"
        placeholder="Enter new GUI state..."
      />
      <button
        type="button"
        @click="handlePushGuiState"
        class="w-fit rounded-md bg-[var(--oterm-accent)]/15 px-3 py-1.5 text-xs font-medium text-[var(--oterm-accent)] transition hover:bg-[var(--oterm-accent)]/25"
      >
        Update GUI State
      </button>
    </div>

    <div class="flex flex-col gap-2">
      <h3 class="text-[11px] font-semibold uppercase tracking-[0.08em] text-(--oterm-faint)">
        Synced GUI State
      </h3>
      <div
        class="min-h-[64px] rounded-md border border-(--oterm-border) bg-[var(--oterm-panel)]/40 px-3 py-2.5"
      >
        <pre
          v-if="syncState.guiState"
          class="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-(--oterm-text)"
        >{{ syncState.guiState }}</pre>
        <p v-else class="text-[11px] text-(--oterm-faint)">No state synced yet.</p>
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col gap-2">
      <h3 class="text-[11px] font-semibold uppercase tracking-[0.08em] text-(--oterm-faint)">
        Terminal Output Log
      </h3>
      <div
        class="oterm-scroll min-h-[96px] flex-1 overflow-y-auto rounded-md border border-(--oterm-border) bg-[var(--oterm-panel)]/40 px-3 py-2.5"
      >
        <pre
          v-if="displayOutput"
          class="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-(--oterm-muted)"
        >{{ displayOutput }}</pre>
        <p v-else class="text-[11px] text-(--oterm-faint)">No terminal output captured yet.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useTerminalSync } from "../composables/useTerminalSync";
import { sanitizeTerminalLogText } from "../lib/terminalPrompt";

const props = defineProps<{
  repoRoot: string;
}>();

const { syncState, pushGuiState } = useTerminalSync(props.repoRoot);
const inputGuiState = ref("");

const displayOutput = computed(() => {
  const raw = syncState.value.output?.trim() ?? "";
  if (!raw) return "";
  return sanitizeTerminalLogText(raw).trim();
});

watch(
  () => syncState.value.guiState,
  (newVal) => {
    if (inputGuiState.value === "") {
      inputGuiState.value = newVal;
    }
  },
);

const handlePushGuiState = () => {
  if (inputGuiState.value !== undefined) {
    pushGuiState(inputGuiState.value);
  }
};
</script>
