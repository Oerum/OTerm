<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import {
  listGitWorktrees,
  removeGitWorktree,
  getSourceControlStatus,
} from "../lib/gitApi";
import { deleteBranch } from "../lib/branchManagerApi";
import type { GitWorktreeInfo, GitSourceControlStatus } from "../types/git";
import { pushAppToast } from "../lib/appToast";

const props = defineProps<{
  repoRoot: string;
  active: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "openTerminal", cwd: string): void;
  (e: "createWorktree"): void;
}>();

const worktrees = ref<GitWorktreeInfo[]>([]);
const statuses = ref<Record<string, GitSourceControlStatus>>({});
const loading = ref(true);
const error = ref<string | null>(null);
const busy = ref(false);

async function loadWorktrees() {
  loading.value = true;
  error.value = null;
  try {
    worktrees.value = await listGitWorktrees(props.repoRoot);
    for (const wt of worktrees.value) {
      getSourceControlStatus(wt.path)
        .then((s) => {
          statuses.value[wt.path] = s;
        })
        .catch(() => {});
    }
  } catch (err) {
    error.value = String(err);
  } finally {
    loading.value = false;
  }
}

function getFolderName(pathStr: string) {
  const parts = pathStr.split(/[/\\]/);
  return parts.pop() || pathStr;
}

onMounted(() => {
  loadWorktrees();
});

watch(
  () => props.active,
  (isActive) => {
    if (isActive) {
      loadWorktrees();
    }
  },
);

function openTerminal(worktree: GitWorktreeInfo) {
  emit("openTerminal", worktree.path);
}

async function deleteWorktree(worktree: GitWorktreeInfo, forceBranch: boolean) {
  if (worktree.isMain) return;
  const msg = forceBranch && worktree.branch
    ? `Are you sure you want to remove the worktree at ${worktree.path} AND delete its branch '${worktree.branch}'?`
    : `Are you sure you want to remove the worktree at ${worktree.path}?`;
  if (!confirm(msg)) return;
  busy.value = true;
  try {
    try {
      await removeGitWorktree(props.repoRoot, worktree.path, false);
    } catch (err) {
      if (confirm(`Failed to remove worktree:\n${String(err)}\n\nWould you like to force delete it? (This will discard any uncommitted changes!)`)) {
        await removeGitWorktree(props.repoRoot, worktree.path, true);
      } else {
        busy.value = false;
        return;
      }
    }
    
    if (forceBranch && worktree.branch) {
      await deleteBranch(props.repoRoot, worktree.branch, false, true);
    }
    pushAppToast(forceBranch && worktree.branch ? "Worktree and branch removed" : "Worktree removed", "success");
    await loadWorktrees();
  } catch (err) {
    pushAppToast(String(err), "error");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col bg-[var(--oterm-bg)] text-[var(--oterm-text)]">
    <header class="flex shrink-0 items-center gap-4 border-b border-[var(--oterm-border)] px-6 py-4 bg-[var(--oterm-panel)]">
      <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--oterm-accent)]/15 text-[var(--oterm-accent)]">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path d="M4 2.5h5.5a1.5 1.5 0 0 1 1.5 1.5v2M4 13.5h5.5a1.5 1.5 0 0 0 1.5-1.5v-2M2.5 8h11" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </div>
      <div class="flex flex-col min-w-0">
        <h2 class="text-sm font-semibold tracking-wide flex items-center gap-1.5">
          Worktrees
          <span v-if="loading" class="flex h-3 w-3 items-center justify-center" aria-hidden="true">
            <svg class="animate-spin text-[var(--oterm-accent)]" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <circle cx="8" cy="8" r="6" stroke-opacity="0.15" stroke-width="2" />
              <path d="M14 8a6 6 0 0 0-6-6" stroke-width="2" stroke-linecap="round" />
            </svg>
          </span>
        </h2>
        <p class="truncate text-xs text-[var(--oterm-muted)] font-mono max-w-[400px]" :title="repoRoot">
          {{ repoRoot }}
        </p>
      </div>
      
      <div class="flex-1" />
      
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex items-center gap-2 rounded-md border border-transparent bg-[var(--oterm-accent)]/15 px-3 py-1.5 text-xs font-medium text-[var(--oterm-accent)] shadow-sm transition hover:bg-[var(--oterm-accent)]/25 focus:outline-none focus:ring-2 focus:ring-[var(--oterm-accent)]/50 disabled:cursor-not-allowed disabled:opacity-50"
          title="Create a new worktree"
          @click="$emit('createWorktree')"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path d="M8 3v10M3 8h10" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          New Worktree
        </button>
        <div class="h-4 w-px bg-[var(--oterm-border)] mx-1" aria-hidden="true" />
        <button
          type="button"
          class="rounded-md p-1.5 text-[var(--oterm-muted)] transition hover:bg-white/10 hover:text-[var(--oterm-text)] focus:outline-none focus:ring-2 focus:ring-white/20"
          title="Close tab"
          @click="emit('close')"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path d="M4 4l8 8M12 4l-8 8" stroke-width="1.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </header>

    <main class="oterm-scroll flex-1 overflow-y-auto bg-[var(--oterm-bg)] p-6">
      <div v-if="!loading && worktrees.length === 0" class="flex h-full items-center justify-center">
        <div class="text-center text-sm text-[var(--oterm-faint)]">
          <svg class="mx-auto mb-3 h-10 w-10 opacity-40" viewBox="0 0 16 16" fill="none" stroke="currentColor">
             <path d="M4 2.5h5.5a1.5 1.5 0 0 1 1.5 1.5v2M4 13.5h5.5a1.5 1.5 0 0 0 1.5-1.5v-2M2.5 8h11" stroke-width="1" stroke-linecap="round" />
          </svg>
          <p>No worktrees found.</p>
        </div>
      </div>
      
      <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="wt in worktrees"
          :key="wt.path"
          class="group flex flex-col overflow-hidden rounded-xl border border-[var(--oterm-border)] bg-[var(--oterm-panel)] shadow-sm transition hover:border-[var(--oterm-border-strong)] hover:shadow-md"
        >
          <div class="flex flex-1 flex-col p-4 pb-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" class="shrink-0 text-[var(--oterm-muted)]">
                    <path d="M2.5 3.5h11a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-7a1 1 0 011-1z" stroke-width="1.2" stroke-linecap="round" />
                    <path d="M2.5 6.5h11" stroke-width="1.2" />
                  </svg>
                  <h3 class="truncate text-sm font-semibold text-[var(--oterm-text)]" data-oterm-tooltip-variant="path" :title="wt.path">
                    {{ getFolderName(wt.path) }}
                  </h3>
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <div class="flex max-w-[200px] items-center gap-1.5 rounded bg-[var(--oterm-accent)]/10 px-1.5 py-0.5 text-[var(--oterm-accent)]">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" class="shrink-0">
                      <path d="M4 2.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zm7 7a2.5 2.5 0 100 5 2.5 2.5 0 000-5zm-7-2v4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                    <span class="truncate font-medium" :title="wt.branch || 'detached'">{{ wt.branch || "detached" }}</span>
                  </div>
                  
                  <template v-if="statuses[wt.path]">
                    <div v-if="statuses[wt.path].changedFiles > 0" class="flex items-center gap-1.5 text-[var(--oterm-muted)]" title="Uncommitted changes">
                      <span v-if="statuses[wt.path].additions > 0" class="text-green-500/80">+{{ statuses[wt.path].additions }}</span>
                      <span v-if="statuses[wt.path].deletions > 0" class="text-red-500/80">-{{ statuses[wt.path].deletions }}</span>
                      <span v-if="statuses[wt.path].additions === 0 && statuses[wt.path].deletions === 0">{{ statuses[wt.path].changedFiles }} files</span>
                    </div>
                    <div v-if="statuses[wt.path].ahead > 0 || statuses[wt.path].behind > 0" class="flex items-center gap-1.5 text-[var(--oterm-muted)]" title="Ahead / Behind upstream">
                      <span v-if="statuses[wt.path].ahead > 0" class="flex items-center text-emerald-500/80">
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" class="mr-0.5"><path d="M8 12V4m0 0L4 8m4-4l4 4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        {{ statuses[wt.path].ahead }}
                      </span>
                      <span v-if="statuses[wt.path].behind > 0" class="flex items-center text-amber-500/80">
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" class="mr-0.5"><path d="M8 4v8m0 0l-4-4m4 4l4-4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        {{ statuses[wt.path].behind }}
                      </span>
                    </div>
                  </template>
                </div>
              </div>
              <span
                v-if="wt.isMain"
                class="shrink-0 rounded-full border border-[var(--oterm-accent)]/20 bg-[var(--oterm-accent)]/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--oterm-accent)]"
              >
                Main
              </span>
            </div>
            
            <div class="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--oterm-faint)] font-mono">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" class="opacity-70">
                <circle cx="5" cy="8" r="2.5" stroke-width="1.5" />
                <path d="M7.5 8h6" stroke-width="1.5" stroke-linecap="round" />
              </svg>
              {{ wt.head.substring(0, 8) }}
            </div>
          </div>
          
          <div class="flex items-center gap-1 border-t border-[var(--oterm-border)] bg-[var(--oterm-bg)] p-1.5">
            <button
              type="button"
              class="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-[var(--oterm-text)] hover:bg-white/5 focus:bg-white/5 focus:outline-none disabled:opacity-40"
              :disabled="busy"
              title="Open terminal in this worktree"
              @click="openTerminal(wt)"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <path d="M2.5 4.5l3.5 3.5-3.5 3.5M7.5 11.5h6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Terminal
            </button>
            <div v-if="!wt.isMain" class="h-3 w-px bg-[var(--oterm-border)] shrink-0" aria-hidden="true" />
            <div v-if="!wt.isMain" class="group/remove relative flex flex-1">
              <button
                type="button"
                class="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-red-400 hover:bg-red-400/10 focus:bg-red-400/10 focus:outline-none disabled:opacity-40 group-hover/remove:hidden"
                :disabled="busy"
                title="Remove worktree"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                  <path d="M3 4h10M5.5 4v-1.5h5V4M6.5 7v5M9.5 7v5M4.5 4l1 9.5a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1l1-9.5" stroke-width="1.2" stroke-linecap="round" />
                </svg>
                Remove
              </button>
              <div class="hidden w-full items-center gap-1 group-hover/remove:flex">
                <button
                  type="button"
                  class="flex flex-1 items-center justify-center rounded-md py-1.5 text-xs font-medium text-red-400 hover:bg-red-400/20 focus:bg-red-400/20 focus:outline-none disabled:opacity-40"
                  :disabled="busy"
                  title="Remove worktree only"
                  @click="deleteWorktree(wt, false)"
                >
                  Worktree
                </button>
                <div v-if="wt.branch" class="h-3 w-px bg-red-400/20 shrink-0" aria-hidden="true" />
                <button
                  v-if="wt.branch"
                  type="button"
                  class="flex flex-1 items-center justify-center rounded-md py-1.5 text-xs font-medium text-red-400 hover:bg-red-400/20 focus:bg-red-400/20 focus:outline-none disabled:opacity-40"
                  :disabled="busy"
                  title="Remove worktree and delete its branch"
                  @click="deleteWorktree(wt, true)"
                >
                  + Branch
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
