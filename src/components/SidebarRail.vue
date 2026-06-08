<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getGitStatus } from "../lib/gitApi";
import { buildTerminalEntries } from "../lib/sidebarEntries";
import type {
  SaveProfileDraft,
  ShellProfile,
  TerminalEntryColor,
  TerminalMenuActionId,
  WorkspaceTab,
} from "../types/terminal";
import TerminalSidebarEntry from "./TerminalSidebarEntry.vue";

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
  closeMany: [tabIds: string[]];
  add: [shellId: string];
  split: [shellId: string];
  renameTab: [tabId: string, title: string];
  moveTab: [tabId: string, direction: "up" | "down"];
  colorChange: [tabId: string, color: TerminalEntryColor];
  saveProfile: [draft: SaveProfileDraft];
}>();

const newMenuOpen = ref(false);
const newMenuRef = ref<HTMLElement | null>(null);
const newButtonRef = ref<HTMLElement | null>(null);
const openMenuEntryId = ref<string | null>(null);
const renamingEntryId = ref<string | null>(null);
const toastMessage = ref<string | null>(null);
const gitByPane = ref(new Map<string, { branch: string | null; isRepo: boolean }>());
let toastTimer: ReturnType<typeof setTimeout> | null = null;

const terminalEntries = computed(() =>
  buildTerminalEntries(
    props.tabs,
    props.shells,
    props.activeTabId,
    props.activePaneId,
    gitByPane.value,
  ),
);

function showToast(message: string) {
  toastMessage.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.value = null;
  }, 1800);
}

async function ensureGitForPane(paneId: string, cwd: string) {
  if (gitByPane.value.has(paneId)) return;
  try {
    const status = await getGitStatus(cwd === "~" ? undefined : cwd);
    gitByPane.value.set(paneId, {
      branch: status.branch,
      isRepo: status.isRepo,
    });
    gitByPane.value = new Map(gitByPane.value);
  } catch {
    gitByPane.value.set(paneId, { branch: null, isRepo: false });
    gitByPane.value = new Map(gitByPane.value);
  }
}

watch(openMenuEntryId, (entryId) => {
  if (!entryId) return;
  const entry = terminalEntries.value.find((item) => item.entryId === entryId);
  if (entry) void ensureGitForPane(entry.paneId, entry.cwd);
});

function toggleNewMenu() {
  if (props.shells.length === 0) return;
  openMenuEntryId.value = null;
  newMenuOpen.value = !newMenuOpen.value;
}

function pickShell(shellId: string) {
  newMenuOpen.value = false;
  emit("add", shellId);
}

function setMenuOpen(entryId: string, open: boolean) {
  openMenuEntryId.value = open ? entryId : null;
  newMenuOpen.value = false;
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(label);
  } catch {
    showToast("Copy failed");
  }
}

function findEntry(entryId: string) {
  return terminalEntries.value.find((item) => item.entryId === entryId);
}

async function onEntryAction(entryId: string, actionId: TerminalMenuActionId) {
  const entry = findEntry(entryId);
  if (!entry) return;

  switch (actionId) {
    case "share-session": {
      if (!entry.sessionId) return;
      await copyText(`oterm://session/${entry.sessionId}`, "Share link copied");
      openMenuEntryId.value = null;
      break;
    }
    case "copy-branch":
      if (entry.gitBranch) await copyText(entry.gitBranch, "Copied branch");
      break;
    case "copy-pane-title":
      await copyText(entry.title, "Copied pane title");
      break;
    case "copy-working-directory":
      await copyText(entry.cwd, "Copied working directory");
      break;
    case "rename-tab": {
      openMenuEntryId.value = null;
      renamingEntryId.value = entryId;
      break;
    }
    case "move-up":
      emit("moveTab", entry.tabId, "up");
      openMenuEntryId.value = null;
      break;
    case "move-down":
      emit("moveTab", entry.tabId, "down");
      openMenuEntryId.value = null;
      break;
    case "close-tab":
      openMenuEntryId.value = null;
      emit("close", entry.tabId);
      break;
    case "close-other-tabs": {
      openMenuEntryId.value = null;
      const ids = props.tabs.filter((tab) => tab.id !== entry.tabId).map((tab) => tab.id);
      if (ids.length) emit("closeMany", ids);
      break;
    }
    case "close-tabs-below": {
      openMenuEntryId.value = null;
      const index = props.tabs.findIndex((tab) => tab.id === entry.tabId);
      if (index === -1) break;
      const ids = props.tabs.slice(index + 1).map((tab) => tab.id);
      if (ids.length) emit("closeMany", ids);
      break;
    }
    case "save-as-profile": {
      openMenuEntryId.value = null;
      emit("saveProfile", {
        label: entry.title,
        shellId: entry.shellId,
        cwd: entry.cwd,
        color: entry.tabColor,
      });
      showToast(`Saved profile "${entry.title}"`);
      break;
    }
  }
}

function onEntryColorChange(entryId: string, color: TerminalEntryColor) {
  const entry = findEntry(entryId);
  if (!entry) return;
  emit("colorChange", entry.tabId, color);
  openMenuEntryId.value = null;
}

function onDocumentClick(event: MouseEvent) {
  const target = event.target as Node | null;
  if (newMenuOpen.value) {
    if (!newMenuRef.value?.contains(target) && !newButtonRef.value?.contains(target)) {
      newMenuOpen.value = false;
    }
  }
  if (openMenuEntryId.value) {
    const inMenu = (target as Element | null)?.closest("[data-terminal-entry-menu-root]");
    if (!inMenu) openMenuEntryId.value = null;
  }
}

function onSidebarScroll() {
  if (openMenuEntryId.value) openMenuEntryId.value = null;
  if (renamingEntryId.value) renamingEntryId.value = null;
}

function onRenameCommit(tabId: string, title: string) {
  renamingEntryId.value = null;
  emit("renameTab", tabId, title);
}

function onRenameCancel() {
  renamingEntryId.value = null;
}

onMounted(() => {
  document.addEventListener("mousedown", onDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocumentClick);
  if (toastTimer) clearTimeout(toastTimer);
});
</script>

<template>
  <aside
    class="relative z-10 flex w-56 shrink-0 flex-col bg-[var(--warp-sidebar)]"
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

    <div
      class="warp-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2"
      @scroll="onSidebarScroll"
    >
      <p
        v-if="terminalEntries.length === 0"
        class="px-2 py-3 text-xs text-[var(--warp-faint)]"
      >
        No open terminals
      </p>

      <TerminalSidebarEntry
        v-for="entry in terminalEntries"
        :key="entry.entryId"
        data-terminal-entry-menu-root
        :entry="entry"
        :menu-open="openMenuEntryId === entry.entryId"
        :renaming="renamingEntryId === entry.entryId"
        @select="(tabId, paneId) => emit('select', tabId, paneId)"
        @menu-toggle="setMenuOpen"
        @action="(actionId) => onEntryAction(entry.entryId, actionId)"
        @color-change="(color) => onEntryColorChange(entry.entryId, color)"
        @rename-commit="onRenameCommit"
        @rename-cancel="onRenameCancel"
      />
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

    <Transition name="sidebar-toast">
      <p
        v-if="toastMessage"
        class="no-drag pointer-events-none absolute bottom-16 left-2 right-2 rounded-md bg-[var(--warp-elevated)] px-2 py-1.5 text-center text-[11px] text-[var(--warp-text)] shadow-lg ring-1 ring-[var(--warp-border-strong)]"
      >
        {{ toastMessage }}
      </p>
    </Transition>
  </aside>
</template>

<style scoped>
.sidebar-toast-enter-active,
.sidebar-toast-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.sidebar-toast-enter-from,
.sidebar-toast-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
