<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useTerminalTabDragReorder } from "../composables/useTerminalTabDragReorder";
import { getGitStatus } from "../lib/gitApi";
import { buildFeatureEntries, buildTerminalEntries } from "../lib/sidebarEntries";
import type {
  CreateMenuAction,
  SaveProfileDraft,
  ShellProfile,
  TerminalEntryColor,
  TerminalMenuActionId,
  WorkspaceTab,
} from "../types/terminal";
import { isTerminalTab } from "../types/terminal";
import TerminalCreateMenu from "./TerminalCreateMenu.vue";
import TerminalSidebarEntry from "./TerminalSidebarEntry.vue";

const props = defineProps<{
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  activePaneId: string | null;
  shells: ShellProfile[];
  defaultShellId: string;
  canReopenClosed: boolean;
  gitRefreshToken?: number;
  activePaneGit?: {
    paneId: string;
    branch: string | null;
    isRepo: boolean;
    changedFiles: number;
    additions: number;
    deletions: number;
  };
}>();

const emit = defineEmits<{
  select: [tabId: string, paneId: string];
  close: [tabId: string];
  closeMany: [tabIds: string[]];
  add: [shellId: string];
  split: [shellId: string];
  reopenClosed: [];
  setDefaultShell: [shellId: string];
  renameTab: [tabId: string, title: string];
  moveTab: [tabId: string, direction: "up" | "down"];
  reorderTab: [tabId: string, toTerminalIndex: number];
  colorChange: [tabId: string, color: TerminalEntryColor];
  saveProfile: [draft: SaveProfileDraft];
}>();

const newMenuOpen = ref(false);
const newMenuRef = ref<HTMLElement | null>(null);
const newButtonRef = ref<HTMLElement | null>(null);
const terminalListRef = ref<HTMLElement | null>(null);
const openMenuEntryId = ref<string | null>(null);
const renamingEntryId = ref<string | null>(null);
const toastMessage = ref<string | null>(null);
const gitByPane = ref(
  new Map<
    string,
    {
      branch: string | null;
      isRepo: boolean;
      changedFiles: number;
      additions: number;
      deletions: number;
    }
  >(),
);
let toastTimer: ReturnType<typeof setTimeout> | null = null;

const featureEntries = computed(() =>
  buildFeatureEntries(props.tabs, props.activeTabId),
);

function featureEntryBadge(
  kind: "pullRequests" | "branchManager" | "issues" | "docker" | "sshSftp" | "settings",
) {
  if (kind === "pullRequests") return "PR";
  if (kind === "branchManager") return "Br";
  if (kind === "issues") return "Is";
  if (kind === "sshSftp") return "SF";
  if (kind === "settings") return "⚙";
  return "Dk";
}

const terminalEntries = computed(() => {
  const entries = buildTerminalEntries(
    props.tabs,
    props.shells,
    props.activeTabId,
    props.activePaneId,
    gitByPane.value,
  );
  const override = props.activePaneGit;
  if (!override?.paneId) return entries;
  return entries.map((entry) =>
    entry.paneId !== override.paneId
      ? entry
      : {
          ...entry,
          gitBranch: override.branch,
          gitIsRepo: override.isRepo,
          gitChangedFiles: override.changedFiles,
          gitAdditions: override.additions,
          gitDeletions: override.deletions,
        },
  );
});

const {
  onDragPointerDown,
  isDropTarget,
  isDropTargetAfter,
  isDraggingTab,
} = useTerminalTabDragReorder(terminalEntries, (tabId, toTerminalIndex) => {
  emit("reorderTab", tabId, toTerminalIndex);
});

function showToast(message: string) {
  toastMessage.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.value = null;
  }, 1800);
}

async function refreshGitForPane(paneId: string, cwd: string) {
  try {
    const status = await getGitStatus(cwd === "~" ? undefined : cwd);
    gitByPane.value.set(paneId, {
      branch: status.branch,
      isRepo: status.isRepo,
      changedFiles: status.changedFiles,
      additions: status.additions,
      deletions: status.deletions,
    });
    gitByPane.value = new Map(gitByPane.value);
  } catch {
    gitByPane.value.set(paneId, {
      branch: null,
      isRepo: false,
      changedFiles: 0,
      additions: 0,
      deletions: 0,
    });
    gitByPane.value = new Map(gitByPane.value);
  }
}

const paneCwdSignature = computed(() =>
  props.tabs
    .filter(isTerminalTab)
    .flatMap((tab) => tab.panes.map((pane) => `${pane.id}:${pane.cwd}`))
    .join("|"),
);

let gitRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleGitRefresh() {
  if (gitRefreshTimer) clearTimeout(gitRefreshTimer);
  gitRefreshTimer = setTimeout(() => {
    for (const tab of props.tabs) {
      if (!isTerminalTab(tab)) continue;
      for (const pane of tab.panes) {
        void refreshGitForPane(pane.id, pane.cwd);
      }
    }
  }, 300);
}

watch(paneCwdSignature, scheduleGitRefresh, { immediate: true });

watch(
  () => props.gitRefreshToken,
  () => {
    for (const tab of props.tabs) {
      if (!isTerminalTab(tab)) continue;
      for (const pane of tab.panes) {
        void refreshGitForPane(pane.id, pane.cwd);
      }
    }
  },
);

function selectFeatureTab(tabId: string) {
  emit("select", tabId, "");
}

watch(openMenuEntryId, (entryId) => {
  if (!entryId) return;
  const entry = terminalEntries.value.find((item) => item.entryId === entryId);
  if (entry) void refreshGitForPane(entry.paneId, entry.cwd);
});

function toggleNewMenu() {
  if (props.shells.length === 0) return;
  openMenuEntryId.value = null;
  newMenuOpen.value = !newMenuOpen.value;
}

function onCreateSelect(action: CreateMenuAction) {
  newMenuOpen.value = false;
  if (action.kind === "default-terminal") {
    emit("add", props.defaultShellId);
    return;
  }
  if (action.kind === "shell") {
    emit("add", action.shellId);
    return;
  }
  if (action.kind === "reopen-closed") {
    emit("reopenClosed");
  }
}

function onSetDefaultShell(shellId: string) {
  emit("setDefaultShell", shellId);
  showToast(`${props.shells.find((s) => s.id === shellId)?.label ?? "Shell"} is now default`);
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
  if (gitRefreshTimer) clearTimeout(gitRefreshTimer);
});
</script>

<template>
  <aside
    class="relative z-10 flex w-56 shrink-0 flex-col bg-[var(--oterm-sidebar)]"
  >
    <div class="relative px-3 py-2.5">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--oterm-faint)]">
          Terminals
        </span>

        <button
          ref="newButtonRef"
          type="button"
          class="no-drag flex h-7 w-7 items-center justify-center rounded-md text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)] disabled:opacity-40"
          :class="newMenuOpen ? 'bg-white/5 text-[var(--oterm-text)]' : ''"
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
      </div>

      <div
        v-if="newMenuOpen"
        ref="newMenuRef"
        class="no-drag absolute inset-x-3 top-full z-50 mt-0.5"
      >
        <TerminalCreateMenu
          :shells="shells"
          :default-shell-id="defaultShellId"
          :can-reopen-closed="canReopenClosed"
          @select="onCreateSelect"
          @set-default="onSetDefaultShell"
          @close="newMenuOpen = false"
        />
      </div>
    </div>

    <div
      ref="terminalListRef"
      class="oterm-scroll min-h-0 flex-1 overflow-y-auto px-1.5 pb-2"
      @scroll="onSidebarScroll"
    >
      <div v-if="featureEntries.length > 0" class="mb-2 space-y-0.5">
        <p class="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--oterm-faint)]">
          Tools
        </p>
        <button
          v-for="entry in featureEntries"
          :key="entry.entryId"
          type="button"
          class="no-drag group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition"
          :class="
            entry.isActive
              ? 'bg-white/[0.08] text-[var(--oterm-text)]'
              : 'text-[var(--oterm-muted)] hover:bg-white/5 hover:text-[var(--oterm-text)]'
          "
          @click="selectFeatureTab(entry.tabId)"
        >
          <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--oterm-bg)] text-[10px] font-semibold uppercase text-[var(--oterm-muted)]"
          >
            {{ featureEntryBadge(entry.kind) }}
          </span>
          <span class="min-w-0 flex-1 truncate">{{ entry.title }}</span>
          <span
            role="button"
            tabindex="0"
            class="no-drag shrink-0 rounded p-0.5 text-[var(--oterm-faint)] opacity-0 transition hover:bg-white/10 hover:text-[var(--oterm-text)] group-hover:opacity-100"
            title="Close"
            aria-label="Close tab"
            @click.stop="emit('close', entry.tabId)"
            @keydown.enter.stop="emit('close', entry.tabId)"
            @keydown.space.prevent.stop="emit('close', entry.tabId)"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M2.5 2.5 7.5 7.5M7.5 2.5 2.5 7.5" stroke-width="1.2" stroke-linecap="round" />
            </svg>
          </span>
        </button>
      </div>

      <p
        v-if="terminalEntries.length === 0 && featureEntries.length === 0"
        class="px-1.5 py-2 text-[0.75rem] text-[var(--oterm-faint)]"
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
        :dragging="isDraggingTab(entry)"
        :drop-target="isDropTarget(entry)"
        :drop-target-after="isDropTargetAfter(entry)"
        @select="(tabId, paneId) => emit('select', tabId, paneId)"
        @menu-toggle="setMenuOpen"
        @action="(actionId) => onEntryAction(entry.entryId, actionId)"
        @color-change="(color) => onEntryColorChange(entry.entryId, color)"
        @rename-commit="onRenameCommit"
        @rename-cancel="onRenameCancel"
        @drag-start="
          (tabId, tabIndex, event) =>
            onDragPointerDown(tabId, tabIndex, event, terminalListRef)
        "
      />
    </div>

    <div class="no-drag border-t border-[var(--oterm-border)] p-3">
      <button
        type="button"
        class="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-elevated)] px-3 py-2 text-xs text-[var(--oterm-muted)] transition hover:border-[var(--oterm-border-strong)] hover:text-[var(--oterm-text)] disabled:opacity-40"
        :disabled="shells.length === 0"
        @click="emit('split', defaultShellId)"
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
        class="no-drag pointer-events-none absolute bottom-16 left-2 right-2 rounded-md bg-[var(--oterm-elevated)] px-2 py-1.5 text-center text-[11px] text-[var(--oterm-text)] shadow-lg ring-1 ring-[var(--oterm-border-strong)]"
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
