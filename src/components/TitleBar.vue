<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWindowDrag } from "../composables/useWindowDrag";
import type { GitStatus } from "../types/git";
import GitDiffBadge from "./GitDiffBadge.vue";
import UserMenu from "./UserMenu.vue";

defineProps<{
  terminalSidebarOpen: boolean;
  toolsOpen: boolean;
  sourceControlOpen: boolean;
  gitStatus: GitStatus;
  canOpenGitFeatures: boolean;
  appVersion: string;
}>();

const emit = defineEmits<{
  toggleTerminalSidebar: [];
  toggleTools: [];
  toggleSourceControl: [];
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
    <div class="no-drag flex items-center pl-2.5 pr-2">
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
              ? 'border-[#42D96B]/50 bg-[var(--oterm-accent-dim)] text-[#7EF2D1]'
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
              ? 'border-[#42D96B]/50 bg-[var(--oterm-accent-dim)] text-[#7EF2D1]'
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

    <div class="no-drag flex items-center gap-1 pr-1">
      <button
        type="button"
        class="rounded-md px-2 py-1 text-xs text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)]"
        title="SSH/SFTP manager"
        @click="emit('openSshSftp')"
      >
        SSH/SFTP
      </button>
      <button
        type="button"
        class="rounded-md px-2 py-1 text-xs text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)]"
        title="Docker manager"
        @click="emit('openDockerManager')"
      >
        Docker
      </button>
      <button
        type="button"
        class="rounded-md px-2 py-1 text-xs transition"
        :class="
          canOpenGitFeatures
            ? 'text-[var(--oterm-muted)] hover:bg-white/5 hover:text-[var(--oterm-text)]'
            : 'cursor-not-allowed text-[var(--oterm-muted)]/40'
        "
        title="Pull requests"
        :disabled="!canOpenGitFeatures"
        @click="emit('openPullRequests')"
      >
        PRs
      </button>
      <button
        type="button"
        class="rounded-md px-2 py-1 text-xs transition"
        :class="
          canOpenGitFeatures
            ? 'text-[var(--oterm-muted)] hover:bg-white/5 hover:text-[var(--oterm-text)]'
            : 'cursor-not-allowed text-[var(--oterm-muted)]/40'
        "
        title="Issues"
        :disabled="!canOpenGitFeatures"
        @click="emit('openIssues')"
      >
        Issues
      </button>
      <button
        type="button"
        class="rounded-md px-2 py-1 text-xs transition"
        :class="
          canOpenGitFeatures
            ? 'text-[var(--oterm-muted)] hover:bg-white/5 hover:text-[var(--oterm-text)]'
            : 'cursor-not-allowed text-[var(--oterm-muted)]/40'
        "
        title="Branch manager"
        :disabled="!canOpenGitFeatures"
        @click="emit('openBranchManager')"
      >
        Branches
      </button>
      <GitDiffBadge
        :git-status="gitStatus"
        :active="sourceControlOpen"
        compact
        @click="emit('toggleSourceControl')"
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
        class="flex h-9 w-11 items-center justify-center text-[var(--oterm-muted)] transition hover:bg-[var(--oterm-danger)] hover:text-white"
        aria-label="Close"
        @click="appWindow.close()"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
          <path d="M1 1l8 8M9 1L1 9" stroke-width="1.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </header>
</template>
