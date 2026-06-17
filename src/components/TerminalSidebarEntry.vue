<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { isTerminalRowDragBlocked } from "../composables/useTerminalTabDragReorder";
import { entryAccentColor } from "../lib/sidebarEntries";
import { hideTooltip } from "../lib/tooltipController";
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

const showBranchFooter = computed(
  () => props.entry.gitIsRepo && !!props.entry.gitBranch,
);



const accentStyle = computed(() => {
  const color = entryAccentColor(props.entry.tabColor);
  if (props.entry.tabColor === "none") {
    return props.entry.isActive ? { borderColor: "rgba(0, 229, 186, 0.2)" } : undefined;
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
      const repoName = normRoot.split("/").pop() || "root";
      if (normCwd === normRoot) {
        pathPart = repoName;
      } else if (normCwd.startsWith(normRoot + "/")) {
        pathPart = `${repoName}/${normCwd.substring(normRoot.length + 1)}`;
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
      class="no-drag group relative flex items-start gap-1 rounded-lg border pr-1.5 transition-all duration-[150ms] select-none"
      :class="[
        entry.splitIndex != null && entry.splitIndex > 1
          ? 'w-[94%] ml-[6%] border-l border-white/[0.05] pl-2 py-0.5'
          : 'w-full py-1 pl-2',
        entry.isActive
          ? 'border-[var(--oterm-accent)]/20 bg-[var(--oterm-accent-dim)]/15 shadow-[0_2px_6px_rgba(0,0,0,0.1)]'
          : 'border-transparent bg-transparent hover:bg-white/[0.02] hover:border-[var(--oterm-border)]',
        renaming ? 'ring-1 ring-[var(--oterm-border-strong)]' : '',
        dragging ? 'opacity-50' : '',
        entry.isFirstPaneOfTab && !renaming ? 'cursor-grab touch-none active:cursor-grabbing' : '',
      ]"
      :style="accentStyle"
      :data-terminal-tab-index="entry.terminalTabIndex"
      :data-terminal-tab-id="entry.tabId"
      :aria-current="entry.isActive ? 'true' : undefined"
      @keydown="onMenuKeyDown"
      @pointerdown="onRowPointerDown"
    >
      <!-- Left edge indicator pill -->
      <span 
        class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r transition-all duration-[150ms]"
        :class="entry.isActive ? 'h-3/5' : 'h-0 group-hover:h-2/5'"
        :style="{
          backgroundColor: entry.tabColor === 'none' 
            ? 'var(--oterm-accent)' 
            : entryAccentColor(entry.tabColor)
        }"
      />

      <!-- Row Content body -->
      <div
        class="flex flex-col min-w-0 flex-1 text-left"
        :class="renaming ? '' : 'cursor-pointer'"
        @click="onRowClick"
      >
        <!-- Top Row: Icon & Name/Input -->
        <div class="flex items-start gap-1.5 w-full">
          <!-- Icon block -->
          <span
            class="flex shrink-0 items-center justify-center rounded transition-colors"
            :class="[
              iconSizeClass,
              entry.activeAgentId
                ? entry.isActive
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-white/3 text-[var(--oterm-muted)]'
                : entry.isActive
                  ? 'bg-[var(--oterm-accent-dim)]/20 text-[var(--oterm-text)]'
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
              width="14"
              height="14"
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

          <!-- Title and Subtitle wrapper -->
          <div class="min-w-0 flex-1 leading-[1.2] pt-0.5">
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
            <div v-else class="flex flex-col min-w-0 w-full">
              <!-- Line 1: Repo/Worktree Context & Branch -->
              <div class="flex items-center justify-between gap-1.5 min-w-0 pr-11">
                <!-- Repo / Worktree / Workspace name -->
                <span
                  class="truncate font-semibold text-[10.5px] tracking-wide"
                  :class="[
                    entry.isActive 
                      ? 'text-white' 
                      : 'text-[var(--oterm-muted)]',
                    gitContext?.isWorktree ? 'text-teal-400 font-medium' : ''
                  ]"
                >
                  <!-- Show repo/worktree icon/emoji or text -->
                  <span class="flex items-center gap-1.5 min-w-0">
                    <!-- Worktree icon or Repo icon -->
                    <svg
                      v-if="gitContext?.isWorktree"
                      width="10"
                      height="10"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      class="text-teal-400 shrink-0"
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
                      :class="entry.isActive ? 'text-[var(--oterm-accent)]' : ''"
                      aria-hidden="true"
                    >
                      <path d="M1.75 3A1.75 1.75 0 0 0 0 4.75v6.5C0 12.21 1.75 13 1.75 13h12.5c.96 0 1.75-.79 1.75-1.75v-5.5A1.75 1.75 0 0 0 14.25 4H8.75L7.25 2.5H1.75z" />
                    </svg>
                    
                    <span class="truncate">{{ displayTitleText }}</span>
                    <span
                      v-if="gitContext?.isWorktree && gitContext?.mainRepoName && !isCustom"
                      class="text-[9px] text-teal-400/80 font-medium shrink truncate ml-0.5"
                      :title="`Worktree: ${gitContext.worktreeName}`"
                    >
                      / {{ gitContext.worktreeName }}
                    </span>
                  </span>
                </span>

                <!-- Right aligned badges: WT & process -->
                <div class="flex items-center gap-1 shrink-0">
                  <!-- WT indicator tag -->
                  <span
                    v-if="gitContext?.isWorktree && !isCustom"
                    class="px-1 py-0.2 text-[7.5px] font-extrabold tracking-wide uppercase text-teal-400 bg-teal-500/10 border border-teal-400/20 rounded-sm"
                    title="Git Worktree"
                  >
                    WT
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Lines under the logo: Line 2 (CWD Context) & Line 3 (Git Info) -->
        <div v-if="!renaming" class="flex flex-col min-w-0 w-full mt-0.5">
          <!-- Line 2: CWD Context -->
          <div
            v-if="displayCwdContext"
            class="flex items-center min-w-0"
          >
            <span
              class="truncate font-mono text-[9px] min-w-0"
              :class="[
                entry.isActive 
                  ? 'text-[var(--oterm-text)] font-semibold' 
                  : 'text-[var(--oterm-faint)]'
              ]"
            >
              {{ displayCwdContext }}
            </span>
          </div>

          <!-- Line 3: Git Info -->
          <div
            v-if="entry.gitIsRepo"
            class="flex flex-wrap items-center gap-1.5 min-w-0 mt-0.5"
          >
            <!-- Branch Badge -->
            <span
              v-if="showBranchFooter"
              class="flex items-center gap-0.5 text-[8.5px] px-1 py-0.2 rounded border font-mono transition-colors shrink-0"
              :class="[
                gitContext?.isWorktree
                  ? 'text-teal-400 bg-teal-500/10 border-teal-400/20'
                  : 'text-sky-400 bg-sky-500/10 border-sky-400/20'
              ]"
            >
              <svg
                width="7"
                height="7"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                class="shrink-0"
                aria-hidden="true"
              >
                <circle cx="4.5" cy="4.5" r="1.5" stroke-width="1.2" />
                <circle cx="11.5" cy="11.5" r="1.5" stroke-width="1.2" />
                <path d="M6 4.5h3.5a2 2 0 0 1 2-2V9" stroke-width="1.2" stroke-linecap="round" />
              </svg>
              <span class="max-w-[120px] truncate">{{ entry.gitBranch }}</span>
            </span>

            <!-- Git Diff Badge -->
            <GitDiffBadge
              :git-status="gitStatus"
              readonly
              compact
            />
          </div>
        </div>
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

      <!-- Action buttons & dot-menu -->
      <div
        data-terminal-entry-actions
        class="absolute top-1 right-1.5 flex items-center gap-0.5 z-10"
      >
        <!-- Close button -->
        <button
          v-if="!renaming"
          type="button"
          class="flex h-5 w-5 items-center justify-center rounded transition-opacity duration-[120ms]"
          :class="[
            entry.isActive
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
            'text-[var(--oterm-faint)] hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500/30',
          ]"
          title="Close tab"
          aria-label="Close tab"
          @click.stop="hideTooltip(); emit('action', 'close-tab')"
        >
          <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="m3 3 10 10M13 3 3 13" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <!-- Menu anchor -->
        <div ref="dotMenuRef" class="relative">
          <button
            v-if="!renaming"
            type="button"
            class="flex h-5 w-5 items-center justify-center rounded transition-opacity duration-[120ms]"
            :class="[
              menuOpen || entry.isActive
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
              menuOpen
                ? 'bg-white/5 text-[var(--oterm-text)]'
                : 'text-[var(--oterm-faint)] hover:bg-white/10 hover:text-[var(--oterm-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--oterm-accent)]',
            ]"
            title="Terminal actions"
            aria-label="Terminal actions"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
            @click.stop="onMenuClick"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
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
</template>

<style scoped>
.term-menu-enter-active,
.term-menu-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.term-menu-enter-from,
.term-menu-leave-to {
  opacity: 0;
  transform: translateY(-2px);
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
