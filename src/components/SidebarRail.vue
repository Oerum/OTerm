<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useTerminalTabDragReorder } from "../composables/useTerminalTabDragReorder";
import { getGitStatus } from "../lib/gitApi";
import {
  buildFeatureEntries,
  buildTerminalEntries,
  buildTerminalSidebarSections,
  groupTerminalSidebarSections,
  entryAccentColor,
  type TerminalSidebarCategory,
} from "../lib/sidebarEntries";
import { writeClipboardText } from "../lib/clipboard";
import type {
  CreateMenuAction,
  SaveProfileDraft,
  ShellProfile,
  TerminalEntryColor,
  TerminalMenuActionId,
  TerminalSidebarSection,
  TerminalTabGroup,
  WorkspaceTab,
} from "../types/terminal";
import { isTerminalTab } from "../types/terminal";
import TerminalCreateMenu from "./TerminalCreateMenu.vue";
import TerminalGroupHeader from "./TerminalGroupHeader.vue";
import TerminalSidebarEntry from "./TerminalSidebarEntry.vue";

const props = defineProps<{
  tabs: WorkspaceTab[];
  terminalGroups: TerminalTabGroup[];
  collapsedGroupIds: string[];
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
    repoRoot: string | null;
  };
  widthPx?: number;
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
  reorderTab: [tabId: string, toTerminalIndex: number, groupId?: string | null];
  colorChange: [tabId: string, color: TerminalEntryColor];
  groupColorChange: [groupId: string, color: TerminalEntryColor];
  saveProfile: [draft: SaveProfileDraft];
  createGroup: [];
  renameGroup: [groupId: string, name: string];
  deleteGroup: [groupId: string];
  toggleGroupCollapsed: [groupId: string];
  moveTabToGroup: [tabId: string, groupId: string | null];
  newGroupAndMove: [tabId: string];
}>();

const newMenuOpen = ref(false);
const newMenuRef = ref<HTMLElement | null>(null);
const newButtonRef = ref<HTMLElement | null>(null);
const terminalListRef = ref<HTMLElement | null>(null);
const openMenuEntryId = ref<string | null>(null);
const openMenuGroupId = ref<string | null>(null);
const renamingEntryId = ref<string | null>(null);
const renamingGroupId = ref<string | null>(null);
const renamingGroupDraft = ref("");
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
      repoRoot: string | null;
      isWorktree: boolean;
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
  return applyGitOverride(entries);
});

function applyGitOverride<T extends { paneId: string; gitBranch: string | null; gitIsRepo: boolean; gitChangedFiles: number; gitAdditions: number; gitDeletions: number; gitRepoRoot: string | null }>(
  entries: T[],
): T[] {
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
          gitRepoRoot: override.repoRoot,
        },
  );
}

const terminalSections = computed((): TerminalSidebarSection[] => {
  const sections = buildTerminalSidebarSections(
    props.terminalGroups,
    props.collapsedGroupIds,
    props.tabs,
    props.shells,
    props.activeTabId,
    props.activePaneId,
    gitByPane.value,
  );
  const override = props.activePaneGit;
  if (!override?.paneId) return sections;
  return sections.map((section) => {
    if (section.kind !== "entry" || section.entry.paneId !== override.paneId) return section;
    return {
      kind: "entry",
      entry: {
        ...section.entry,
        gitBranch: override.branch,
        gitIsRepo: override.isRepo,
        gitChangedFiles: override.changedFiles,
        gitAdditions: override.additions,
        gitDeletions: override.deletions,
        gitRepoRoot: override.repoRoot,
      },
    };
  });
});

const terminalCategories = computed(() => groupTerminalSidebarSections(terminalSections.value));

function categoryGroupId(category: TerminalSidebarCategory): string | null {
  return category.kind === "group" ? category.groupId : null;
}

const {
  draggingTabId,
  onDragPointerDown,
  isDropTarget,
  isDropTargetAfter,
  isGroupDropTarget,
  isDraggingTab,
  getEntryDragStyle,
} = useTerminalTabDragReorder(terminalEntries, (tabId, toTerminalIndex, groupId) => {
  emit("reorderTab", tabId, toTerminalIndex, groupId);
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
      repoRoot: status.repoRoot ?? null,
      isWorktree: status.isWorktree ?? false,
    });
    gitByPane.value = new Map(gitByPane.value);
  } catch {
    gitByPane.value.set(paneId, {
      branch: null,
      isRepo: false,
      changedFiles: 0,
      additions: 0,
      deletions: 0,
      repoRoot: null,
      isWorktree: false,
    });
    gitByPane.value = new Map(gitByPane.value);
  }
}

async function refreshGitForAllPanes() {
  const cwds = new Set<string>();
  for (const tab of props.tabs) {
    if (!isTerminalTab(tab)) continue;
    for (const pane of tab.panes) {
      if (pane.cwd) {
        cwds.add(pane.cwd);
      }
    }
  }

  const results = new Map<
    string,
    {
      branch: string | null;
      isRepo: boolean;
      changedFiles: number;
      additions: number;
      deletions: number;
      repoRoot: string | null;
      isWorktree: boolean;
    }
  >();

  await Promise.all(
    Array.from(cwds).map(async (cwd) => {
      try {
        const status = await getGitStatus(cwd === "~" ? undefined : cwd);
        results.set(cwd, {
          branch: status.branch,
          isRepo: status.isRepo,
          changedFiles: status.changedFiles,
          additions: status.additions,
          deletions: status.deletions,
          repoRoot: status.repoRoot ?? null,
          isWorktree: status.isWorktree ?? false,
        });
      } catch {
        results.set(cwd, {
          branch: null,
          isRepo: false,
          changedFiles: 0,
          additions: 0,
          deletions: 0,
          repoRoot: null,
          isWorktree: false,
        });
      }
    }),
  );

  for (const tab of props.tabs) {
    if (!isTerminalTab(tab)) continue;
    for (const pane of tab.panes) {
      const res = results.get(pane.cwd);
      if (res) {
        gitByPane.value.set(pane.id, res);
      }
    }
  }
  gitByPane.value = new Map(gitByPane.value);
}

const paneCwdSignature = computed(() =>
  props.tabs
    .filter(isTerminalTab)
    .flatMap((tab) => tab.panes.map((pane) => `${pane.id}:${pane.cwd}`))
    .join("|"),
);

let gitRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let pollingInterval: number | undefined;

function scheduleGitRefresh() {
  if (gitRefreshTimer) clearTimeout(gitRefreshTimer);
  gitRefreshTimer = setTimeout(() => {
    void refreshGitForAllPanes();
  }, 300);
}

watch(paneCwdSignature, scheduleGitRefresh, { immediate: true });

watch(
  () => props.gitRefreshToken,
  () => {
    void refreshGitForAllPanes();
  },
);

onMounted(() => {
  pollingInterval = window.setInterval(() => {
    void refreshGitForAllPanes();
  }, 10000);
});

onBeforeUnmount(() => {
  if (gitRefreshTimer) clearTimeout(gitRefreshTimer);
  window.clearInterval(pollingInterval);
});

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
    await writeClipboardText(text);
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
    case "split-pane": {
      emit("select", entry.tabId, entry.paneId);
      nextTick(() => {
        emit("split", entry.shellId);
      });
      openMenuEntryId.value = null;
      break;
    }
  }
}

function onMoveToGroup(entryId: string, groupId: string | null) {
  const entry = findEntry(entryId);
  if (!entry) return;
  emit("moveTabToGroup", entry.tabId, groupId);
  openMenuEntryId.value = null;
}

function onNewGroupAndMove(entryId: string) {
  const entry = findEntry(entryId);
  if (!entry) return;
  emit("newGroupAndMove", entry.tabId);
  openMenuEntryId.value = null;
}

function startGroupRename(groupId: string, name: string) {
  renamingGroupId.value = groupId;
  renamingGroupDraft.value = name;
}

function commitGroupRename(groupId: string, name: string) {
  renamingGroupId.value = null;
  emit("renameGroup", groupId, name.trim() || "Group");
}

function cancelGroupRename() {
  renamingGroupId.value = null;
}

function getCategoryDropStyle(category: TerminalSidebarCategory) {
  const isTarget = isGroupDropTarget(categoryGroupId(category));
  if (!isTarget) return undefined;

  const colorId = category.kind === "group" ? category.color : "none";
  if (colorId === "none") {
    // Premium subtle steel-grey/white highlight for "none" groups and ungrouped section
    return {
      backgroundColor: "rgba(255, 255, 255, 0.03)",
      borderColor: "rgba(255, 255, 255, 0.15)",
    };
  }

  const hex = entryAccentColor(colorId);
  return {
    backgroundColor: `${hex}0d`, // ~5% opacity
    borderColor: `${hex}40`,     // ~25% opacity
  };
}

function setGroupMenuOpen(groupId: string, open: boolean) {
  openMenuGroupId.value = open ? groupId : null;
  openMenuEntryId.value = null;
  newMenuOpen.value = false;
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
  if (openMenuGroupId.value) {
    const inMenu = (target as Element | null)?.closest("[data-terminal-group-menu-root]");
    if (!inMenu) openMenuGroupId.value = null;
  }
}

function onSidebarScroll() {
  if (openMenuEntryId.value) openMenuEntryId.value = null;
  if (openMenuGroupId.value) openMenuGroupId.value = null;
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
    class="terminal-sidebar relative z-20 flex shrink-0 flex-col bg-[var(--oterm-sidebar)]"
    :style="{ width: widthPx ? `${widthPx}px` : '224px' }"
    @contextmenu.prevent
  >
    <div class="relative px-3 py-2.5">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--oterm-faint)]">
          Terminals
        </span>

        <div class="flex items-center gap-0.5">
          <button
            type="button"
            class="no-drag flex h-7 w-7 items-center justify-center rounded-md text-[var(--oterm-muted)] btn-premium"
            title="New group"
            aria-label="New group"
            @click.stop="emit('createGroup')"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M2 3.5h8M2 6.5h5M2 9.5h8" stroke-width="1.2" stroke-linecap="round" />
            </svg>
          </button>

          <button
            ref="newButtonRef"
            type="button"
            class="no-drag flex h-7 w-7 items-center justify-center rounded-md text-[var(--oterm-muted)] btn-premium disabled:opacity-40"
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
      class="oterm-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden pl-0.5 pr-1 pb-2 sidebar-scroll-container"
      @scroll="onSidebarScroll"
    >
      <div class="flex flex-col min-h-full w-full pointer-events-auto">
      <div v-if="featureEntries.length > 0" class="mb-2 space-y-0.5">
        <p class="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--oterm-faint)]">
          Tools
        </p>
        <button
          v-for="entry in featureEntries"
          :key="entry.entryId"
          type="button"
          class="no-drag group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm btn-premium"
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
        v-if="terminalSections.length === 0 && featureEntries.length === 0"
        class="px-1.5 py-2 text-[0.75rem] text-[var(--oterm-faint)]"
      >
        No open terminals
      </p>

      <template v-for="(category, categoryIndex) in terminalCategories" :key="`${category.kind}-${categoryIndex}`">
        <div
          class="rounded-lg border border-transparent transition-all duration-[120ms] group-category flex flex-col gap-1"
          :style="getCategoryDropStyle(category)"
          :data-terminal-group-section="category.kind === 'group' ? category.groupId : 'ungrouped'"
        >
           <TerminalGroupHeader
            v-if="category.kind === 'group'"
            data-terminal-group-menu-root
            :group-id="category.groupId"
            :name="category.name"
            :tab-count="category.tabCount"
            :collapsed="category.collapsed"
            :color="category.color"
            :renaming="renamingGroupId === category.groupId"
            :menu-open="openMenuGroupId === category.groupId"
            v-model:rename-value="renamingGroupDraft"
            :is-dragging-any="draggingTabId !== null"
            @toggle-collapse="emit('toggleGroupCollapsed', category.groupId)"
            @rename-commit="(name) => commitGroupRename(category.groupId, name)"
            @rename-cancel="cancelGroupRename"
            @delete-group="emit('deleteGroup', category.groupId)"
            @color-change="(color) => emit('groupColorChange', category.groupId, color)"
            @menu-toggle="(open) => setGroupMenuOpen(category.groupId, open)"
            @start-rename="startGroupRename(category.groupId, category.name)"
          />

          <div
            v-else-if="category.showHeader"
            class="no-drag flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left transition select-none mt-2.5"
            data-terminal-group-drop="ungrouped"
            data-group-id="ungrouped"
          >
            <span class="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--oterm-faint)]">
              Ungrouped
            </span>
            <span class="shrink-0 font-mono text-[10px] text-[var(--oterm-faint)]">({{ category.tabCount }})</span>
          </div>

          <!-- Indented sub-container for group entries -->
          <div
            v-if="category.kind === 'group' && !category.collapsed && category.entries.length > 0"
            class="group-guide-line mt-0.5 ml-1.5 pl-1 flex flex-col gap-1"
            :style="{
              '--guide-color-base': category.color === 'none' 
                ? 'rgba(255, 255, 255, 0.04)' 
                : `${entryAccentColor(category.color)}12`,
              '--guide-color-hover': category.color === 'none' 
                ? 'rgba(255, 255, 255, 0.14)' 
                : `${entryAccentColor(category.color)}28`
            }"
          >
            <TerminalSidebarEntry
              v-for="entry in category.entries"
              :key="entry.entryId"
              data-terminal-entry-menu-root
              :entry="entry"
              :groups="terminalGroups"
              :menu-open="openMenuEntryId === entry.entryId"
              :renaming="renamingEntryId === entry.entryId"
              :dragging="isDraggingTab(entry)"
              :drop-target="isDropTarget(entry)"
              :drop-target-after="isDropTargetAfter(entry)"
              :drag-style="getEntryDragStyle(entry)"
              :is-dragging-any="draggingTabId !== null"
              @select="(tabId, paneId) => emit('select', tabId, paneId)"
              @menu-toggle="setMenuOpen"
              @action="(actionId) => onEntryAction(entry.entryId, actionId)"
              @move-to-group="(groupId) => onMoveToGroup(entry.entryId, groupId)"
              @new-group-and-move="onNewGroupAndMove(entry.entryId)"
              @color-change="(color) => onEntryColorChange(entry.entryId, color)"
              @rename-commit="onRenameCommit"
              @rename-cancel="onRenameCancel"
              @drag-start="
                (tabId, tabIndex, event, handleEl) =>
                  onDragPointerDown(tabId, tabIndex, event, terminalListRef, handleEl)
              "
            />
          </div>
          <template v-else-if="category.kind === 'ungrouped' || category.collapsed">
            <TerminalSidebarEntry
              v-for="entry in category.entries"
              :key="entry.entryId"
              data-terminal-entry-menu-root
              :entry="entry"
              :groups="terminalGroups"
              :menu-open="openMenuEntryId === entry.entryId"
              :renaming="renamingEntryId === entry.entryId"
              :dragging="isDraggingTab(entry)"
              :drop-target="isDropTarget(entry)"
              :drop-target-after="isDropTargetAfter(entry)"
              :drag-style="getEntryDragStyle(entry)"
              :is-dragging-any="draggingTabId !== null"
              @select="(tabId, paneId) => emit('select', tabId, paneId)"
              @menu-toggle="setMenuOpen"
              @action="(actionId) => onEntryAction(entry.entryId, actionId)"
              @move-to-group="(groupId) => onMoveToGroup(entry.entryId, groupId)"
              @new-group-and-move="onNewGroupAndMove(entry.entryId)"
              @color-change="(color) => onEntryColorChange(entry.entryId, color)"
              @rename-commit="onRenameCommit"
              @rename-cancel="onRenameCancel"
              @drag-start="
                (tabId, tabIndex, event, handleEl) =>
                  onDragPointerDown(tabId, tabIndex, event, terminalListRef, handleEl)
              "
            />
          </template>
        </div>
      </template>
      </div>
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
.sidebar-scroll-container {
  margin-right: -80px !important;
  padding-right: 84px !important; /* 80px shift + 4px (px-1) original padding */
  pointer-events: none;
  scrollbar-width: none !important; /* Firefox */
  -ms-overflow-style: none !important; /* IE/Edge */
}

.sidebar-scroll-container::-webkit-scrollbar {
  display: none !important; /* Chrome, Safari, Opera */
}

.sidebar-toast-enter-active,
.sidebar-toast-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.sidebar-toast-enter-from,
.sidebar-toast-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.group-guide-line {
  border-left: 1px solid var(--guide-color-base);
  transition: border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.group-category:hover .group-guide-line {
  border-left-color: var(--guide-color-hover);
}
</style>
