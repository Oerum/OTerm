<script setup lang="ts">
import { computed } from "vue";
import type { ShellProfile, WorkspaceTab } from "../types/terminal";

const props = defineProps<{
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  shells: ShellProfile[];
  preferredShellId: string;
}>();

const emit = defineEmits<{
  select: [tabId: string];
  close: [tabId: string];
  add: [shellId: string];
}>();

const shellLabels = computed(() =>
  Object.fromEntries(props.shells.map((shell) => [shell.id, shell.label])),
);

function tabLabel(tab: WorkspaceTab) {
  const shellId = tab.panes[0]?.shellId ?? "shell";
  return shellLabels.value[shellId] ?? tab.title;
}
</script>

<template>
  <header
    class="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--warp-border)] bg-[var(--warp-panel)] px-3"
  >
    <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="group flex max-w-[11rem] items-center gap-2 rounded-full px-3 py-1 text-xs transition"
        :class="
          tab.id === activeTabId
            ? 'bg-[var(--warp-elevated)] text-[var(--warp-text)] shadow-[inset_0_0_0_1px_var(--warp-border-strong)]'
            : 'text-[var(--warp-muted)] hover:bg-white/[0.04] hover:text-[var(--warp-text)]'
        "
        @click="emit('select', tab.id)"
      >
        <span
          class="h-1.5 w-1.5 shrink-0 rounded-full"
          :class="tab.id === activeTabId ? 'bg-[var(--warp-accent)]' : 'bg-[var(--warp-faint)]'"
        />
        <span class="truncate">{{ tabLabel(tab) }}</span>
        <span
          class="rounded-full px-1 text-[10px] leading-none text-[var(--warp-faint)] opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-[var(--warp-text)]"
          @click.stop="emit('close', tab.id)"
        >
          ×
        </span>
      </button>

      <button
        type="button"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--warp-muted)] transition hover:bg-white/[0.04] hover:text-[var(--warp-text)] disabled:opacity-40"
        title="New tab"
        aria-label="New tab"
        :disabled="shells.length === 0"
        @click="emit('add', preferredShellId)"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
          <path d="M6 2.5v7M2.5 6h7" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </header>
</template>
