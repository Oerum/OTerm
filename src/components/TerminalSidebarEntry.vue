<script setup lang="ts">
import { inject, ref, computed, watch, onUnmounted, nextTick } from "vue";
import { hideTooltip } from "../lib/tooltipController";
import { isTerminalRowDragBlocked } from "../composables/useTerminalTabDragReorder";
import { entryAccentColor } from "../lib/sidebarEntries";
import {
  agentStatusDotClass,
  agentStatusLabel,
  agentStatusTextClass,
  displayAgentStatus,
} from "../lib/agentStatus";
import type { TerminalMenuActionId, TerminalSidebarEntry, TerminalTabGroup } from "../types/terminal";
import AgentFooterBadge from "./AgentFooterBadge.vue";
import GitDiffBadge from "./GitDiffBadge.vue";
import TerminalEntryMenu from "./TerminalEntryMenu.vue";

const props = defineProps<{
  entry: TerminalSidebarEntry;
  menuOpen: boolean;
  renaming: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  dropTargetAfter?: boolean;
  groups?: TerminalTabGroup[];
  dragStyle?: any;
  isDraggingAny?: boolean;
}>();

const emit = defineEmits<{
  select: [tabId: string, paneId: string];
  menuToggle: [entryId: string, open: boolean];
  action: [actionId: TerminalMenuActionId];
  colorChange: [color: import("../types/terminal").TerminalEntryColor];
  moveToGroup: [groupId: string | null];
  newGroupAndMove: [];
  renameCommit: [tabId: string, title: string];
  renameCancel: [];
  dragStart: [tabId: string, terminalTabIndex: number, event: PointerEvent, handleEl: HTMLElement];
}>();

const renameInputRef = ref<HTMLInputElement | null>(null);
const renameDraft = ref("");
const skipBlurCommit = ref(false);

const gitStatus = computed(() => ({
  isRepo: props.entry.gitIsRepo,
  branch: props.entry.gitBranch,
  upstream: null,
  ahead: 0,
  behind: 0,
  changedFiles: props.entry.gitChangedFiles,
  additions: props.entry.gitAdditions,
  deletions: props.entry.gitDeletions,
}));

const showUnseenNotification = computed(
  () => props.entry.hasUnseenNotification && !props.entry.isActive,
);

const agentDisplayStatus = computed(() => {
  if (props.entry.agentStatus === "unknown") return null;
  if (!props.entry.activeAgentId && props.entry.agentStatus !== "idle") return null;
  return displayAgentStatus(props.entry.agentStatus, props.entry.agentStatusSeen);
});

const showAgentStatus = computed(() => {
  const status = agentDisplayStatus.value;
  if (!status) return false;
  if (!props.entry.isActive) return true;
  return status === "working" || status === "blocked";
});

const showBranchFooter = computed(
  () => props.entry.gitIsRepo && !!props.entry.gitBranch,
);



const accentStyle = computed(() => {
  const color = entryAccentColor(props.entry.tabColor);
  if (props.entry.tabColor === "none") {
    return props.entry.isActive ? { borderColor: "rgba(255, 255, 255, 0.12)" } : undefined;
  }
  if (color.startsWith("#") && color.length === 7) {
    return { borderColor: `${color}35` };
  }
  return { borderColor: color };
});

const iconSizeClass = computed(() =>
  props.entry.splitIndex != null && props.entry.splitIndex > 1 ? "h-4 w-4" : "h-[22px] w-[22px]",
);

const gitContext = computed(() => {
  if (!props.entry.gitIsRepo || !props.entry.gitRepoRoot) {
    return null;
  }
  const rootPath = props.entry.gitRepoRoot.replace(/\\/g, "/");
  const segments = rootPath.split("/").filter(Boolean);
  const folderName = segments[segments.length - 1] || "";

  if (rootPath.includes("/.worktree/")) {
    const parts = rootPath.split("/.worktree/");
    const mainRepoPath = parts[0];
    const mainRepoSegments = mainRepoPath.split("/").filter(Boolean);
    const mainRepoName = mainRepoSegments[mainRepoSegments.length - 1] || "";
    const worktreeSegment = parts[1].split("/")[0];
    return {
      mainRepoName,
      worktreeName: worktreeSegment,
      isWorktree: true,
      displayName: `${mainRepoName} (${worktreeSegment})`,
    };
  }

  if (props.entry.gitIsWorktree) {
    return {
      mainRepoName: null,
      worktreeName: folderName,
      isWorktree: true,
      displayName: folderName,
    };
  }

  return {
    mainRepoName: folderName,
    worktreeName: null,
    isWorktree: false,
    displayName: folderName,
  };
});

const isCustom = computed(() => {
  if (props.entry.activeAgentId) return true;
  if (props.entry.tabTitle !== "Terminal") return true;
  const cwd = props.entry.cwd;
  if (!cwd || cwd === "~") {
    return props.entry.title !== props.entry.shellLabel;
  }
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  const lastFolder = parts[parts.length - 1] || "";
  const cleanTitle = props.entry.title.replace(/\s*\(\d+\)$/, "");
  return cleanTitle !== lastFolder && cleanTitle !== props.entry.shellLabel;
});

const displayRepoName = computed(() => {
  if (gitContext.value) {
    if (gitContext.value.isWorktree && gitContext.value.mainRepoName) {
      return gitContext.value.mainRepoName;
    }
    return gitContext.value.displayName;
  }
  const cwd = props.entry.cwd;
  if (!cwd || cwd === "~") {
    return "Local";
  }
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || "Local";
});

const displayTitleText = computed(() => {
  if (isCustom.value) {
    return props.entry.title;
  }
  let title = displayRepoName.value;
  if (props.entry.splitIndex) {
    title = `${title} (${props.entry.splitIndex})`;
  }
  return title;
});

const homeCollapsedPath = computed(() => {
  const cwd = props.entry.cwd;
  if (!cwd) return "";
  let displayPath = cwd.replace(/\\/g, "/");
  displayPath = displayPath.replace(/^C:\/Users\/[^/]+/i, "~");
  return displayPath;
});

const displayCwdContext = computed(() => {
  let pathPart = "";
  const cwd = props.entry.cwd;
  if (cwd) {
    const normCwd = cwd.replace(/\\/g, "/");
    if (props.entry.gitIsRepo && props.entry.gitRepoRoot) {
      const normRoot = props.entry.gitRepoRoot.replace(/\\/g, "/");
      if (normCwd === normRoot) {
        pathPart = ""; // Clear path when at repository root to prevent redundancy
      } else if (normCwd.startsWith(normRoot + "/")) {
        pathPart = normCwd.substring(normRoot.length + 1); // Relative path inside repository without duplicating repo name
      } else {
        pathPart = normCwd;
      }
    } else {
      pathPart = homeCollapsedPath.value;
    }
  }
  return pathPart;
});

watch(
  () => props.renaming,
  (renaming) => {
    if (!renaming) return;
    renameDraft.value = props.entry.renameDefault;
    nextTick(() => {
      renameInputRef.value?.focus();
      renameInputRef.value?.select();
    });
  },
);

function onRowClick() {
  if (props.renaming) return;
  emit("select", props.entry.tabId, props.entry.paneId);
}

function onMenuClick() {
  emit("menuToggle", props.entry.entryId, !props.menuOpen);
}

function onMenuKeyDown(event: KeyboardEvent) {
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    event.preventDefault();
    emit("menuToggle", props.entry.entryId, true);
  }
}

function onContextMenu() {
  emit("menuToggle", props.entry.entryId, true);
}

function commitRename() {
  emit("renameCommit", props.entry.tabId, renameDraft.value);
}

function cancelRename() {
  skipBlurCommit.value = true;
  emit("renameCancel");
}

function onRenameBlur() {
  if (skipBlurCommit.value) {
    skipBlurCommit.value = false;
    return;
  }
  commitRename();
}

function onRenameKeyDown(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.key === "Enter") {
    event.preventDefault();
    skipBlurCommit.value = true;
    commitRename();
  } else if (event.key === "Escape") {
    event.preventDefault();
    cancelRename();
  }
}

function onRowPointerDown(event: PointerEvent) {
  if (!props.entry.isFirstPaneOfTab || props.renaming || event.button !== 0) return;
  const target = event.target as HTMLElement;
  if (isTerminalRowDragBlocked(target)) return;
  const handleEl = event.currentTarget as HTMLElement;
  emit("dragStart", props.entry.tabId, props.entry.terminalTabIndex, event, handleEl);
}

const getTerminalPreview = inject<(paneId: string) => string | null>("getTerminalPreview");
let hoverTimer: number | null = null;
let streamTimer: number | null = null;

function onMouseEnter(event: MouseEvent) {
  if (hoverTimer) window.clearTimeout(hoverTimer);
  hoverTimer = window.setTimeout(() => {
    startStreamingPreview(event);
  }, 1500);
}

const previewVisible = ref(false);
const previewText = ref("");
const previewX = ref(0);
const previewY = ref(0);

function startStreamingPreview(event: MouseEvent) {
  if (!getTerminalPreview) return;
  
  const updatePreview = () => {
    const rawText = getTerminalPreview(props.entry.paneId);
    
    if (rawText === null || rawText === undefined) {
      previewVisible.value = false;
      return;
    }
    
    const text = rawText.trimEnd();
    if (!text) {
      previewVisible.value = false;
      return;
    }
    
    previewText.value = text;
    
    // Position to the right of the cursor, clamped slightly
    previewX.value = event.clientX + 30;
    previewY.value = Math.max(20, event.clientY - 60);
    previewVisible.value = true;
  };
  
  updatePreview();
  streamTimer = window.setInterval(updatePreview, 500);
}

function hideTooltipPreview() {
  previewVisible.value = false;
}

function onMouseLeave() {
  if (hoverTimer) {
    window.clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  if (streamTimer) {
    window.clearInterval(streamTimer);
    streamTimer = null;
  }
  hideTooltipPreview();
}

onUnmounted(() => {
  onMouseLeave();
});

const openUpward = ref(false);
const dotMenuRef = ref<HTMLElement | null>(null);

watch(
  () => props.menuOpen,
  (isOpen) => {
    if (isOpen && dotMenuRef.value) {
      const rect = dotMenuRef.value.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      openUpward.value = spaceBelow < 320 && rect.top > spaceBelow;
    }
  }
);
</script>

<template>
  <div
    class="relative"
    data-terminal-entry-menu-root
  >
    <div
      v-if="dropTarget"
      class="pointer-events-none absolute inset-x-0 -top-px z-10 h-0.5 rounded-full bg-[var(--oterm-accent)] shadow-[0_0_8px_rgba(0,229,186,0.5)]"
      aria-hidden="true"
    />
    <div
      v-if="dropTargetAfter"
      class="pointer-events-none absolute inset-x-0 -bottom-px z-10 h-0.5 rounded-full bg-[var(--oterm-accent)] shadow-[0_0_8px_rgba(0,229,186,0.5)]"
      aria-hidden="true"
    />

    <div
      class="no-drag group relative flex items-center gap-2.5 rounded-lg border py-1.5 px-1.5 transition-all duration-[150ms] select-none"
      :class="[
        entry.splitIndex != null && entry.splitIndex > 1
          ? 'w-[94%] ml-[6%] border-l border-white/[0.05] pl-2.5 py-1'
          : 'w-full',
        entry.isActive
          ? 'border-white/12 bg-white/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.15)]'
          : 'border-[var(--oterm-border)]/30 bg-white/[0.01] hover:bg-white/[0.03] hover:border-[var(--oterm-border)]/70 shadow-[0_1px_3px_rgba(0,0,0,0.05)]',
        renaming ? 'ring-1 ring-[var(--oterm-border-strong)]' : '',
        dragging ? 'opacity-50' : '',
        entry.isFirstPaneOfTab && !renaming ? 'cursor-grab touch-none active:cursor-grabbing' : '',
      ]"
      :style="[accentStyle, dragStyle]"
      :data-terminal-tab-index="entry.terminalTabIndex"
      :data-terminal-tab-id="entry.tabId"
      :aria-current="entry.isActive ? 'true' : undefined"
      @keydown="onMenuKeyDown"
      @pointerdown="onRowPointerDown"
      @contextmenu.prevent.stop="onContextMenu"
      @mouseenter="onMouseEnter"
      @mouseleave="onMouseLeave"
    >
      <!-- Left edge indicator pill -->
      <span 
        class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r transition-all duration-[150ms]"
        :class="entry.isActive ? 'h-3/5' : 'h-0 group-hover:h-2/5'"
        :style="{
          backgroundColor: entry.tabColor === 'none' 
            ? 'rgba(255, 255, 255, 0.45)' 
            : entryAccentColor(entry.tabColor)
        }"
      />

      <!-- Icon block -->
      <span
        class="flex shrink-0 items-center justify-center rounded transition-colors"
        :class="[
          iconSizeClass,
          entry.activeAgentId
            ? entry.isActive
              ? 'bg-white/8 text-white'
              : 'bg-white/3 text-[var(--oterm-muted)]'
            : entry.isActive
              ? 'bg-white/8 text-white'
              : 'bg-white/3 text-[var(--oterm-muted)]',
        ]"
      >
        <AgentFooterBadge
          v-if="entry.activeAgentId"
          :agent-id="entry.activeAgentId"
          :size="entry.splitIndex != null && entry.splitIndex > 1 ? 'sm' : 'md'"
        />
        <svg
          v-else-if="entry.splitIndex != null && entry.splitIndex > 1"
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            d="M4 3.5h6.5a1.5 1.5 0 0 1 1.5 1.5V9M4 3.5 7 6.5 4 9.5M4 3.5v6"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <svg
          v-else
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            d="M3 4.5 6.5 8 3 11.5M8 11.5h5"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>

      <div
        class="flex flex-col min-w-0 flex-1 text-left justify-center leading-tight"
        :class="renaming ? '' : 'cursor-pointer'"
        @click="onRowClick"
      >
        <input
          v-if="renaming"
          ref="renameInputRef"
          v-model="renameDraft"
          type="text"
          class="block h-[18px] w-full truncate rounded border border-[var(--oterm-border-strong)] bg-[var(--oterm-bg)] px-1.5 text-[10px] font-semibold text-[var(--oterm-text)] outline-none focus:border-[var(--oterm-accent)]/40 focus:ring-1 focus:ring-[var(--oterm-accent)]/15"
          aria-label="Tab name"
          @click.stop
          @keydown="onRenameKeyDown"
          @blur="onRenameBlur"
        />
        <template v-else>
          <!-- Line 1: Title and Status Info -->
          <div class="flex items-center justify-between gap-2 w-full min-w-0 pr-4">
            <div
              class="min-w-0 flex-1 flex items-center gap-1.5 font-semibold text-[10.5px] tracking-wide"
              :class="[
                entry.isActive 
                  ? 'text-white' 
                  : 'text-[var(--oterm-muted)]'
              ]"
            >
              <!-- Worktree icon or Repo icon -->
              <svg
                v-if="gitContext?.isWorktree"
                width="10"
                height="10"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                class="text-[var(--oterm-muted)] shrink-0"
                aria-hidden="true"
              >
                <circle cx="4.5" cy="11.5" r="2.5" />
                <circle cx="11.5" cy="4.5" r="2.5" />
                <path d="M4.5 9V6a2 2 0 0 1 2-2h3" />
              </svg>
              <svg
                v-else-if="gitContext"
                width="10"
                height="10"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                class="text-[var(--oterm-muted)] shrink-0"
                aria-hidden="true"
              >
                <path d="M1.75 3A1.75 1.75 0 0 0 0 4.75v6.5C0 12.21 1.75 13 1.75 13h12.5c.96 0 1.75-.79 1.75-1.75v-5.5A1.75 1.75 0 0 0 14.25 4H8.75L7.25 2.5H1.75z" />
              </svg>
              
              <span class="truncate flex-1">{{ displayTitleText }}</span>

            </div>

            <!-- Right side badges/stats (inline right) -->
            <div class="flex items-center gap-1.5 shrink-0">
              <span
                v-if="showAgentStatus && agentDisplayStatus"
                class="flex items-center gap-1 rounded px-1 py-0.5 text-[8px] font-semibold"
                :class="agentStatusTextClass(agentDisplayStatus)"
              >
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  :class="agentStatusDotClass(agentDisplayStatus)"
                />
                {{ agentStatusLabel(agentDisplayStatus) }}
              </span>
              <!-- WT tag -->
              <span
                v-if="gitContext?.isWorktree && !isCustom"
                class="px-1 py-0.2 text-[7px] font-extrabold tracking-wide uppercase text-[var(--oterm-muted)] bg-white/5 border border-white/10 rounded-sm select-none"
                title="Git Worktree"
              >
                WT
              </span>
              <!-- Active command/process -->
              <span
                v-if="entry.activeProcessName"
                class="px-1 py-0.2 text-[8px] font-mono font-medium text-[var(--oterm-muted)] bg-white/5 border border-white/5 rounded-sm select-none truncate max-w-[65px]"
                :title="entry.activeProcessCmd || entry.activeProcessName"
              >
                {{ entry.activeProcessName }}
              </span>
            </div>
          </div>

          <!-- Line 2: Path, Branch & Git Diff inline -->
          <div class="flex items-center gap-1.5 w-full min-w-0 mt-0.5 text-[9.5px]">
            <!-- CWD Path Context -->
            <span
              v-if="displayCwdContext"
              class="truncate font-mono text-[9px] min-w-0 flex-1"
              :class="entry.isActive ? 'text-[var(--oterm-text)] font-medium' : 'text-[var(--oterm-faint)]'"
            >
              {{ displayCwdContext }}
            </span>

            <!-- Separator dot -->
            <span v-if="displayCwdContext && (showBranchFooter || entry.gitIsRepo)" class="text-[var(--oterm-faint)]/50 select-none shrink-0">·</span>

            <!-- Branch Badge (Clean inline style) -->
            <span
              v-if="showBranchFooter"
              class="flex items-center gap-0.5 font-mono text-[9px] text-[var(--oterm-muted)] hover:text-[var(--oterm-text)] transition-colors min-w-0 shrink"
              :class="gitContext?.isWorktree ? 'text-teal-400/90' : 'text-sky-400/90'"
            >
              <svg
                width="8"
                height="8"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                class="shrink-0"
                aria-hidden="true"
              >
                <circle cx="4.5" cy="4.5" r="1.5" />
                <circle cx="11.5" cy="11.5" r="1.5" />
                <path d="M6 4.5h3.5a2 2 0 0 1 2-2V9" stroke-linecap="round" />
              </svg>
              <span class="truncate flex-1">{{ entry.gitBranch }}</span>
            </span>

            <!-- Separator dot -->
            <span v-if="showBranchFooter && entry.gitIsRepo && (gitStatus.changedFiles > 0 || gitStatus.additions > 0 || gitStatus.deletions > 0)" class="text-[var(--oterm-faint)]/50 select-none shrink-0">·</span>

            <!-- Git Diff Stats inline -->
            <GitDiffBadge
              v-if="entry.gitIsRepo"
              :git-status="gitStatus"
              readonly
              compact
              class="font-mono text-[9px] shrink-0"
            />
          </div>
        </template>
      </div>

      <!-- Notifications -->
      <svg
        v-if="showUnseenNotification"
        class="h-3 w-3 shrink-0 text-[var(--oterm-accent)] absolute right-1.5 top-1/2 -translate-y-1/2"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-label="Unseen notification"
        role="status"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>

      <!-- Action buttons & dot-menu (Floating on the right, overlapping the entry card) -->
      <div
        v-if="!isDraggingAny"
        data-terminal-entry-actions
        class="absolute left-[calc(100%-20px)] top-0 flex items-center z-20 transition-all duration-[150ms] ease-out origin-left"
        :class="menuOpen ? 'opacity-100 scale-100 translate-x-0 -translate-y-1/2' : 'opacity-0 scale-95 -translate-x-1.5 -translate-y-1/2 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-x-0 group-focus-within:opacity-100 group-focus-within:scale-100 group-focus-within:translate-x-0'"
      >
        <!-- A small unified pill background -->
        <div class="flex items-center gap-0.5 bg-[var(--oterm-elevated)] border border-[var(--oterm-border-strong)] rounded-md px-1 py-0.5 shadow-lg">
          <!-- Close button -->
          <button
            v-if="!renaming"
            type="button"
            class="flex h-4.5 w-4.5 items-center justify-center rounded text-[var(--oterm-faint)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
            title="Close tab"
            aria-label="Close tab"
            @click.stop="hideTooltip(); emit('action', 'close-tab')"
          >
            <svg width="7" height="7" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="m3 3 10 10M13 3 3 13" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>

          <!-- Separator line -->
          <span class="w-[1px] h-3 bg-[var(--oterm-border)] mx-0.5" />

          <!-- Menu anchor -->
          <div ref="dotMenuRef" class="relative">
            <button
              v-if="!renaming"
              type="button"
              class="flex h-4.5 w-4.5 items-center justify-center rounded text-[var(--oterm-faint)] hover:bg-white/10 hover:text-[var(--oterm-text)] transition-colors"
              title="Terminal actions"
              aria-label="Terminal actions"
              aria-haspopup="menu"
              :aria-expanded="menuOpen"
              @click.stop="onMenuClick"
            >
              <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
                <circle cx="5" cy="2" r="0.9" fill="currentColor" />
                <circle cx="5" cy="5" r="0.9" fill="currentColor" />
                <circle cx="5" cy="8" r="0.9" fill="currentColor" />
              </svg>
            </button>

            <Transition name="term-menu">
              <TerminalEntryMenu
                v-if="menuOpen && !renaming"
                :entry="entry"
                :open="menuOpen"
                :open-upward="openUpward"
                :groups="groups"
                @close="emit('menuToggle', entry.entryId, false)"
                @action="(id) => emit('action', id)"
                @color-change="(color) => emit('colorChange', color)"
                @move-to-group="(groupId) => emit('moveToGroup', groupId)"
                @new-group-and-move="emit('newGroupAndMove')"
              />
            </Transition>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Screen Popover for Terminal Preview -->
  <Teleport to="body">
    <Transition name="oterm-popover">
      <div
        v-if="previewVisible"
        class="fixed z-[10000] bg-[#1a1b26] border border-[#2f354a] rounded-lg shadow-2xl flex flex-col overflow-hidden pointer-events-none"
        :style="{ 
          left: `${previewX}px`, 
          top: `${previewY}px`, 
          width: '500px', 
          maxHeight: '350px' 
        }"
      >
        <div class="h-8 bg-[#16161e] border-b border-[#2f354a] flex items-center px-4 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
          <span class="text-xs font-semibold text-white/70 truncate flex-1 flex justify-center">{{ entry.title }}</span>
          <span class="text-[10px] text-[var(--oterm-accent)] font-medium uppercase tracking-wider bg-[var(--oterm-accent)]/10 px-1.5 py-0.5 rounded ml-2">Live</span>
        </div>
        <div class="flex-1 overflow-hidden p-3 bg-[#1a1b26]">
          <pre class="font-mono text-[11px] text-[#a9b1d6] whitespace-pre-wrap break-words leading-tight">{{ previewText }}</pre>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.term-menu-enter-active,
.term-menu-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.term-menu-enter-from,
.term-menu-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.oterm-popover-enter-active,
.oterm-popover-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}

.oterm-popover-enter-from,
.oterm-popover-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .term-menu-enter-active,
  .term-menu-leave-active {
    transition: none;
  }

  .term-menu-enter-from,
  .term-menu-leave-to {
    transform: none;
  }
}
</style>
