<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
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
  split: [shellId: string];
}>();

const newMenuOpen = ref(false);
const newMenuRef = ref<HTMLElement | null>(null);
const newButtonRef = ref<HTMLElement | null>(null);

const shellLabels = computed(() =>
  Object.fromEntries(props.shells.map((shell) => [shell.id, shell.label])),
);

function tabLabel(tab: WorkspaceTab) {
  const pane = tab.panes[0];
  const shell = shellLabels.value[pane?.shellId ?? ""] ?? "Terminal";
  const cwd = pane?.cwd;
  if (!cwd || cwd === "~") return shell;
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  const folder = parts[parts.length - 1];
  return folder ? `${shell} · ${folder}` : shell;
}

function toggleNewMenu() {
  if (props.shells.length === 0) return;
  newMenuOpen.value = !newMenuOpen.value;
}

function pickShell(shellId: string) {
  newMenuOpen.value = false;
  emit("add", shellId);
}

function onDocumentClick(event: MouseEvent) {
  if (!newMenuOpen.value) return;
  const target = event.target as Node | null;
  if (newMenuRef.value?.contains(target) || newButtonRef.value?.contains(target)) return;
  newMenuOpen.value = false;
}

onMounted(() => document.addEventListener("mousedown", onDocumentClick));
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocumentClick));
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      class="group flex max-w-[12rem] shrink-0 items-center gap-2 rounded-full px-3 py-1 text-xs transition"
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

    <div class="relative shrink-0">
      <button
        ref="newButtonRef"
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-full text-[var(--warp-muted)] transition hover:bg-white/[0.04] hover:text-[var(--warp-text)] disabled:opacity-40"
        title="New terminal"
        aria-label="New terminal"
        :disabled="shells.length === 0"
        @click.stop="toggleNewMenu"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
          <path d="M6 2.5v7M2.5 6h7" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>

      <div
        v-if="newMenuOpen"
        ref="newMenuRef"
        class="absolute left-0 top-full z-50 mt-1 min-w-[11rem] overflow-hidden rounded-lg border border-[var(--warp-border-strong)] bg-[var(--warp-elevated)] py-1 shadow-xl"
      >
        <p class="px-3 py-1.5 text-[10px] uppercase tracking-wide text-[var(--warp-faint)]">
          Open terminal
        </p>
        <button
          v-for="shell in shells"
          :key="shell.id"
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-white/5"
          :class="
            shell.id === preferredShellId
              ? 'text-[var(--warp-accent)]'
              : 'text-[var(--warp-text)]'
          "
          @click="pickShell(shell.id)"
        >
          {{ shell.label }}
        </button>
      </div>
    </div>

    <button
      type="button"
      class="ml-1 flex h-7 shrink-0 items-center rounded-full px-2.5 text-[11px] text-[var(--warp-muted)] transition hover:bg-white/[0.04] hover:text-[var(--warp-text)] disabled:opacity-40"
      title="Split pane"
      :disabled="shells.length === 0"
      @click="emit('split', preferredShellId)"
    >
      Split
    </button>
  </div>
</template>
