<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWindowDrag } from "../composables/useWindowDrag";
import type { GitBranchList, GitStatus } from "../types/git";
import dockerIcon from "../assets/docker/docker-mark-ocean-blue.svg";
import BranchSwitcherButton from "./BranchSwitcherButton.vue";
import GitDiffBadge from "./GitDiffBadge.vue";
import GitMenu from "./GitMenu.vue";
import SshMenu from "./SshMenu.vue";
import UserMenu from "./UserMenu.vue";

defineProps<{
  terminalSidebarOpen: boolean;
  toolsOpen: boolean;
  sourceControlOpen: boolean;
  gitStatus: GitStatus;
  gitBranches: GitBranchList;
  gitBusy?: boolean;
  gitWorktreeHint?: { path: string; branch: string | null } | null;
  canOpenGitFeatures: boolean;
  appVersion: string;
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
</script>

<template>
  <header
    class="flex h-9 shrink-0 items-center border-b border-[var(--oterm-border)] bg-[var(--oterm-titlebar)]"
  >
    <div class="no-drag flex h-full w-56 shrink-0 items-center border-r border-[var(--oterm-border)] pl-2.5 pr-2">
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
      class="drag-region min-w-0 flex-1 self-stretch"
      data-tauri-drag-region
      @mousedown="onDragMouseDown"
    />

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
