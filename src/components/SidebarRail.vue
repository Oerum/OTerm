<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { ShellProfile, WorkspaceTab } from "../types/terminal";

const props = defineProps<{
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  activePaneId: string | null;
  shells: ShellProfile[];
  preferredShellId: string;
}>();

const emit = defineEmits<{
  select: [tabId: string, paneId: string];
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

const terminalEntries = computed(() =>
  props.tabs.flatMap((tab) =>
    tab.panes.map((pane, index) => ({
      tabId: tab.id,
      pane,
      splitIndex: tab.panes.length > 1 ? index + 1 : null,
    })),
  ),
);

function paneShellLabel(pane: WorkspaceTab["panes"][number]) {
  return shellLabels.value[pane.shellId] ?? "Terminal";
}

function paneTitle(pane: WorkspaceTab["panes"][number], splitIndex: number | null) {
  const cwd = pane.cwd;
  let title = paneShellLabel(pane);
  if (cwd && cwd !== "~") {
    const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
    title = parts[parts.length - 1] || cwd;
  }
  if (splitIndex) title = `${title} (${splitIndex})`;
  return title;
}

function paneSubtitle(pane: WorkspaceTab["panes"][number]) {
  const cwd = pane.cwd;
  if (!cwd || cwd === "~") return paneShellLabel(pane);
  return `${paneShellLabel(pane)} · ${cwd}`;
}

function isActiveEntry(tabId: string, paneId: string) {
  return tabId === props.activeTabId && paneId === props.activePaneId;
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

onMounted(() => {
  document.addEventListener("mousedown", onDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocumentClick);
});
</script>

<template>
  <aside
    class="flex w-56 shrink-0 flex-col border-r border-[var(--warp-border)] bg-[var(--warp-sidebar)]"
  >
    <div class="relative flex items-center justify-between px-3 py-2.5">
      <span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--warp-faint)]">
        Terminals
      </span>

      <div class="relative">
        <button
          ref="newButtonRef"
          type="button"
          class="no-drag flex h-7 w-7 items-center justify-center rounded-md text-[var(--warp-muted)] transition hover:bg-white/5 hover:text-[var(--warp-text)] disabled:opacity-40"
          :class="newMenuOpen ? 'bg-white/5 text-[var(--warp-text)]' : ''"
          title="New terminal"
          aria-label="New terminal"
          aria-haspopup="menu"
          :aria-expanded="newMenuOpen"
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
          class="no-drag absolute right-0 top-full z-50 mt-1 min-w-[11rem] overflow-hidden rounded-lg border border-[var(--warp-border-strong)] bg-[var(--warp-elevated)] py-1 shadow-xl"
          role="menu"
        >
          <p class="px-3 py-1.5 text-[10px] uppercase tracking-wide text-[var(--warp-faint)]">
            Open terminal
          </p>
          <button
            v-for="shell in shells"
            :key="shell.id"
            type="button"
            role="menuitem"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-white/5"
            :class="
              shell.id === preferredShellId
                ? 'text-[var(--warp-accent)]'
                : 'text-[var(--warp-text)]'
            "
            @click="pickShell(shell.id)"
          >
            <span
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--warp-bg)] text-[10px] font-semibold uppercase text-[var(--warp-muted)]"
            >
              {{ shell.label.slice(0, 1) }}
            </span>
            <span class="truncate">{{ shell.label }}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <p
        v-if="terminalEntries.length === 0"
        class="px-2 py-3 text-xs text-[var(--warp-faint)]"
      >
        No open terminals
      </p>

      <button
        v-for="entry in terminalEntries"
        :key="entry.pane.id"
        type="button"
        class="no-drag group mb-1 flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition"
        :class="
          isActiveEntry(entry.tabId, entry.pane.id)
            ? 'bg-[var(--warp-accent-dim)] shadow-[inset_2px_0_0_0_var(--warp-accent)]'
            : 'hover:bg-white/[0.04]'
        "
        @click="emit('select', entry.tabId, entry.pane.id)"
      >
        <span
          class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          :class="
            isActiveEntry(entry.tabId, entry.pane.id)
              ? 'bg-[var(--warp-accent-dim)] text-[var(--warp-accent)]'
              : 'bg-[var(--warp-elevated)] text-[var(--warp-muted)]'
          "
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path
              d="M3 4.5 6.5 8 3 11.5M8 11.5h5"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>

        <span class="min-w-0 flex-1">
          <span
            class="block truncate text-sm font-medium"
            :class="
              isActiveEntry(entry.tabId, entry.pane.id)
                ? 'text-[var(--warp-text)]'
                : 'text-[var(--warp-muted)]'
            "
          >
            {{ paneTitle(entry.pane, entry.splitIndex) }}
          </span>
          <span class="block truncate text-[11px] text-[var(--warp-faint)]">
            {{ paneSubtitle(entry.pane) }}
          </span>
        </span>

        <span
          class="no-drag mt-0.5 rounded px-1 text-sm leading-none text-[var(--warp-faint)] opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-[var(--warp-text)]"
          title="Close terminal"
          @click.stop="emit('close', entry.tabId)"
        >
          ×
        </span>
      </button>
    </div>

    <div class="no-drag border-t border-[var(--warp-border)] p-3">
      <button
        type="button"
        class="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--warp-border)] bg-[var(--warp-elevated)] px-3 py-2 text-xs text-[var(--warp-muted)] transition hover:border-[var(--warp-border-strong)] hover:text-[var(--warp-text)] disabled:opacity-40"
        :disabled="shells.length === 0"
        @click="emit('split', preferredShellId)"
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor">
          <rect x="2" y="2.5" width="10" height="9" rx="1" stroke-width="1.2" />
          <path d="M7 2.5v9" stroke-width="1.2" />
        </svg>
        Split pane
      </button>
    </div>
  </aside>
</template>
