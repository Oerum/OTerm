<script setup lang="ts">
import { computed } from "vue";
import type { GitStatus } from "../types/git";
import type { PullRequestSummary } from "../types/pullRequest";
import type { ShellProfile, WorkspacePane } from "../types/terminal";
import AgentFooterBadge from "./AgentFooterBadge.vue";
import GitDiffBadge from "./GitDiffBadge.vue";

const props = defineProps<{
  pane: WorkspacePane | null;
  shells: ShellProfile[];
  gitStatus: GitStatus;
  terminalSidebarOpen: boolean;
  toolsOpen: boolean;
  sourceControlOpen: boolean;
  activePr?: PullRequestSummary | null;
  prLoading?: boolean;
}>();

const emit = defineEmits<{
  toggleTerminalSidebar: [];
  toggleTools: [];
  toggleSourceControl: [];
  openPullRequests: [];
}>();

function formatPath(cwd: string | undefined) {
  if (!cwd || cwd === "~") return "~";
  return cwd.replace(/^([A-Za-z]:\\Users\\[^\\]+)/, "~");
}

const displayPath = computed(() => formatPath(props.pane?.cwd));

const shellLabel = computed(
  () => props.shells.find((shell) => shell.id === props.pane?.shellId)?.label ?? "Shell",
);

const prLabel = computed(() => {
  const pr = props.activePr;
  if (!pr) return "";
  const draft = pr.isDraft ? " draft" : "";
  return `PR #${pr.number}${draft}`;
});

const prTitle = computed(() => {
  const pr = props.activePr;
  if (!pr) return "";
  const draft = pr.isDraft ? " (draft)" : "";
  return `${pr.title}${draft} · ${pr.headRef} → ${pr.baseRef}`;
});
</script>

<template>
  <footer
    class="flex h-9 shrink-0 items-center gap-3 border-t border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-3 text-[11px] text-[var(--oterm-faint)]"
  >
    <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
      <AgentFooterBadge
        v-if="pane?.activeAgentId"
        :agent-id="pane.activeAgentId"
      />

      <span
        v-if="pane?.activeAgentId"
        class="hidden h-3 w-px shrink-0 bg-[var(--oterm-border-strong)] sm:block"
      />

      <button
        type="button"
        class="no-drag flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 transition hover:bg-white/5 hover:text-[var(--oterm-text)]"
        :class="terminalSidebarOpen ? 'text-[var(--oterm-accent)]' : ''"
        title="Toggle terminals sidebar"
        aria-label="Toggle terminals sidebar"
        @click="emit('toggleTerminalSidebar')"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
          <path
            d="M3 4.5 6.5 8 3 11.5M8 11.5h5"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <button
        type="button"
        class="no-drag flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 transition hover:bg-white/5 hover:text-[var(--oterm-text)]"
        :class="toolsOpen ? 'text-[var(--oterm-accent)]' : ''"
        title="Toggle file explorer"
        aria-label="Toggle file explorer"
        @click="emit('toggleTools')"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
          <path
            d="M2.5 5.5h4l1.2-1.5H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V6a.5.5 0 0 1 .5-.5Z"
            stroke-width="1.2"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <span class="hidden h-3 w-px shrink-0 bg-[var(--oterm-border-strong)] sm:block" />

      <span class="flex min-w-0 items-center gap-1 truncate font-mono text-[var(--oterm-muted)]">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" class="shrink-0" aria-hidden="true">
          <path
            d="M2.5 5.5h4l1.2-1.5H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V6a.5.5 0 0 1 .5-.5Z"
            stroke-width="1.2"
            stroke-linejoin="round"
          />
        </svg>
        <span class="truncate">{{ displayPath }}</span>
      </span>

      <template v-if="gitStatus.isRepo">
        <span class="hidden h-3 w-px shrink-0 bg-[var(--oterm-border-strong)] lg:block" />
        <GitDiffBadge
          class="hidden lg:flex"
          :git-status="gitStatus"
          :active="sourceControlOpen"
          @click="emit('toggleSourceControl')"
        />
        <button
          v-if="activePr"
          type="button"
          class="no-drag hidden shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] text-[#58a6ff] transition hover:bg-white/5 lg:flex"
          :title="prTitle"
          :aria-label="`Open ${prLabel}`"
          @click="emit('openPullRequests')"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            class="shrink-0"
            aria-hidden="true"
          >
            <path
              d="M4 3.5h6.5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 4 3.5Z"
              stroke-width="1.2"
            />
            <path d="M7 6.5h5M7 9h3.5" stroke-width="1.2" stroke-linecap="round" />
          </svg>
          <span>{{ prLabel }}</span>
        </button>
        <span
          v-else-if="prLoading"
          class="hidden text-[10px] text-[var(--oterm-faint)] lg:inline"
        >
          …
        </span>
      </template>
    </div>

    <div class="hidden shrink-0 items-center gap-3 sm:flex">
      <span class="text-[var(--oterm-muted)]">{{ shellLabel }}</span>
      <span>Ctrl+R history</span>
    </div>
  </footer>
</template>
