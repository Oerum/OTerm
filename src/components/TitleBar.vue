<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWindowDrag } from "../composables/useWindowDrag";
import type { GitBranchList, GitStatus } from "../types/git";
import dockerIcon from "../assets/docker/docker-mark-ocean-blue.svg";
import BranchSwitcherButton from "./BranchSwitcherButton.vue";
import GitDiffBadge from "./GitDiffBadge.vue";
import GitMenu from "./GitMenu.vue";
import SshMenu from "./SshMenu.vue";
import UserMenu from "./UserMenu.vue";
import { formatPathFull, formatPathShort, formatTitleCompact, isShellExecutablePath } from "../lib/formatPath";
import type { ShellProfile, WorkspacePane } from "../types/terminal";
import { getCliAgentDefinition } from "../lib/terminalAgentMode";

const props = defineProps<{
  terminalSidebarOpen: boolean;
  toolsOpen: boolean;
  sourceControlOpen: boolean;
  gitStatus: GitStatus;
  gitBranches: GitBranchList;
  gitBusy?: boolean;
  gitWorktreeHint?: { path: string; branch: string | null } | null;
  canOpenGitFeatures: boolean;
  appVersion: string;
  sidebarWidthPx?: number;
  pane?: WorkspacePane | null;
  shells?: ShellProfile[];
  tabTitle?: string;
}>();

const emit = defineEmits<{
  toggleTerminalSidebar: [];
  toggleTools: [];
  toggleSourceControl: [];
  switchBranch: [branch: string, isRemote: boolean];
  openSshSftp: [];
  openDockerManager: [];
  openPullRequests: [];
  openBranchManager: [];
  openIssues: [];
  openSettings: [];
}>();

const appWindow = getCurrentWindow();
const { startDrag } = useWindowDrag();

function onDragMouseDown(event: MouseEvent) {
  if (event.detail === 2) {
    void appWindow.toggleMaximize();
    return;
  }
  startDrag(event);
}

const shellLabel = computed(
  () => (props.shells ?? []).find((shell) => shell.id === props.pane?.shellId)?.label ?? "Terminal",
);

const manualTabTitle = computed(() => props.tabTitle !== "Terminal");

const fullDisplayTitle = computed(() => {
  if (props.pane) {
    if (props.pane.customTitle?.trim()) return props.pane.customTitle.trim();
    if (props.pane.activeAgentId) {
      const osc = props.pane.oscTitle?.trim();
      if (osc && !isShellExecutablePath(osc)) {
        return osc;
      }
      return getCliAgentDefinition(props.pane.activeAgentId).displayName;
    }
  }
  const title = props.tabTitle ?? "Terminal";
  return manualTabTitle.value ? title : shellLabel.value;
});

const isDefaultTitle = computed(() => {
  if (manualTabTitle.value) return false;
  if (props.pane?.activeAgentId) return false;
  return true;
});

const displayTitle = computed(() => formatTitleCompact(fullDisplayTitle.value));

const shortCwd = computed(() => formatPathShort(props.pane?.cwd));

const cwdTooltip = computed(() => formatPathFull(props.pane?.cwd));

const localActiveProcessCmd = ref<string | null>(null);
let processCmdTimeout: number | undefined;

watch(
  () => props.pane?.activeProcessCmd,
  (newCmd) => {
    if (processCmdTimeout) {
      window.clearTimeout(processCmdTimeout);
      processCmdTimeout = undefined;
    }
    localActiveProcessCmd.value = newCmd ?? null;
    if (newCmd) {
      processCmdTimeout = window.setTimeout(() => {
        localActiveProcessCmd.value = null;
        processCmdTimeout = undefined;
      }, 30000);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (processCmdTimeout) {
    window.clearTimeout(processCmdTimeout);
  }
});
</script>

<template>
  <header
    class="flex h-9 shrink-0 items-center border-b border-[var(--oterm-border)] bg-[var(--oterm-titlebar)]"
  >
    <div
      class="no-drag flex h-full shrink-0 items-center border-r border-[var(--oterm-border)] pl-2.5 pr-2"
      :style="{ width: sidebarWidthPx ? `${sidebarWidthPx}px` : '224px' }"
    >
      <img
        src="/app-icon.svg"
        alt=""
        class="h-5 w-5 shrink-0"
        width="20"
        height="20"
        draggable="false"
      />
      <div class="ml-4 flex items-center gap-1.5 border-l border-white/[0.08] pl-3.5">
        <button
          type="button"
          class="flex h-6 w-6 items-center justify-center rounded-full border transition"
          :class="
            terminalSidebarOpen
              ? 'border-[var(--oterm-accent)]/40 bg-[var(--oterm-accent-dim)] text-[var(--oterm-accent)]'
              : 'border-white/10 text-[var(--oterm-muted)] hover:border-white/20 hover:text-[#F5F5F7]'
          "
          title="Toggle terminal sidebar"
          aria-label="Toggle terminal sidebar"
          @click="emit('toggleTerminalSidebar')"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path
              d="M3.5 4.5 7 8 3.5 11.5M8.5 11.5h4.5"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          class="flex h-6 w-6 items-center justify-center rounded-full border transition"
          :class="
            toolsOpen
              ? 'border-[var(--oterm-accent)]/40 bg-[var(--oterm-accent-dim)] text-[var(--oterm-accent)]'
              : 'border-white/10 text-[var(--oterm-muted)] hover:border-white/20 hover:text-[#F5F5F7]'
          "
          title="Toggle tools sidebar"
          aria-label="Toggle tools sidebar"
          @click="emit('toggleTools')"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" stroke-width="1.4" />
            <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" stroke-width="1.4" />
            <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" stroke-width="1.4" />
            <rect x="9" y="9" width="4.5" height="4.5" rx="1" stroke-width="1.4" />
          </svg>
        </button>
      </div>
    </div>

    <div
      class="drag-region min-w-0 flex-1 self-stretch flex items-center justify-start pl-4 gap-3"
      data-tauri-drag-region
      @mousedown="onDragMouseDown"
    >
      <span
        v-if="pane"
        class="pointer-events-auto group/title flex min-w-0 items-center gap-0 truncate text-xs text-[var(--oterm-muted)] cursor-default select-none"
      >
        <span
          class="shrink-0 text-[var(--oterm-text)] transition-all duration-300 ease-in-out"
          :class="[
            isDefaultTitle
              ? 'max-w-0 opacity-0 overflow-hidden group-hover/title:max-w-[180px] group-hover/title:opacity-100 group-hover/title:pr-1.5'
              : ''
          ]"
          :title="fullDisplayTitle !== displayTitle ? fullDisplayTitle : undefined"
        > {{ displayTitle }}</span>
        <template v-if="shortCwd">
          <span class="shrink-0 text-[var(--oterm-faint)]"> / </span>
          <span
            class="min-w-0 truncate text-[var(--oterm-text)]"
            data-oterm-tooltip-variant="path"
            :title="cwdTooltip ?? undefined"
          >{{ shortCwd }}</span>
        </template>
      </span>

      <!-- Running process badge -->
      <span
        v-if="localActiveProcessCmd"
        class="no-drag flex items-center gap-1.5 text-[8.5px] px-2 py-0.5 rounded border font-mono text-emerald-400 bg-emerald-500/10 border-emerald-400/20 transition-colors shrink-0"
        :title="localActiveProcessCmd"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <span class="max-w-[200px] truncate font-medium">{{ localActiveProcessCmd }}</span>
      </span>
    </div>

    <div class="no-drag flex items-center gap-1">
      <SshMenu @open-ssh-sftp="emit('openSshSftp')" />
      <button
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-[var(--oterm-muted)] transition hover:border-white/20 hover:bg-white/5 hover:text-[#F5F5F7]"
        title="Docker manager"
        aria-label="Docker manager"
        @click="emit('openDockerManager')"
      >
        <img :src="dockerIcon" class="h-3.5 w-3.5 shrink-0 object-contain" alt="" draggable="false" />
      </button>
      <GitMenu
        :can-open-git-features="canOpenGitFeatures"
        @open-pull-requests="emit('openPullRequests')"
        @open-issues="emit('openIssues')"
        @open-branch-manager="emit('openBranchManager')"
      />
      <GitDiffBadge
        :git-status="gitStatus"
        :active="sourceControlOpen"
        compact
        @click="emit('toggleSourceControl')"
      />
      <BranchSwitcherButton
        :git-status="gitStatus"
        :branches="gitBranches"
        :busy="gitBusy"
        :worktree-hint="gitWorktreeHint"
        compact
        @switch="(branch, remote) => emit('switchBranch', branch, remote)"
      />
      <UserMenu :app-version="appVersion" class="mx-0.5" @open-settings="emit('openSettings')" />
      <button
        type="button"
        class="flex h-9 w-11 items-center justify-center text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)]"
        aria-label="Minimize"
        @click="appWindow.minimize()"
      >
        <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
          <rect width="10" height="1" />
        </svg>
      </button>
      <button
        type="button"
        class="flex h-9 w-11 items-center justify-center text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)]"
        aria-label="Maximize"
        @click="appWindow.toggleMaximize()"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
          <rect x="0.5" y="0.5" width="9" height="9" stroke-width="1" />
        </svg>
      </button>
      <button
        type="button"
        class="flex h-9 w-11 items-center justify-center rounded-tr-lg text-[var(--oterm-muted)] transition hover:bg-[var(--oterm-danger)] hover:text-white"
        aria-label="Close"
        @click="void appWindow.close()"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
          <path d="M1 1l8 8M9 1L1 9" stroke-width="1.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </header>
</template>
