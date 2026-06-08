<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { getGitFileDiff, readGitWorkingFile, writeGitWorkingFile } from "../lib/gitApi";
import type {
  GitBranchList,
  GitCommitEntry,
  GitFileEntry,
  GitOperation,
  GitSourceControlStatus,
  SelectedGitFile,
} from "../types/git";
import GitDiffViewer from "./GitDiffViewer.vue";
import GitFileEditor from "./GitFileEditor.vue";
import GitFileLineStats from "./GitFileLineStats.vue";

type PaneView = "diff" | "edit";

const DIFF_PANE_MIN_WIDTH = 520;

const props = defineProps<{
  status: GitSourceControlStatus;
  branches: GitBranchList;
  history: GitCommitEntry[];
  loading: boolean;
  busy: boolean;
  operation: GitOperation | null;
  operationLabel: string | null;
  panelWidth: number;
}>();

const emit = defineEmits<{
  stage: [paths: string[]];
  unstage: [paths: string[]];
  revert: [paths: string[], untracked: boolean];
  commit: [message: string];
  fetch: [];
  pull: [];
  push: [];
  sync: [];
  checkout: [branch: string, remote: boolean];
  refresh: [];
}>();

const commitMessage = ref("");
const selectedFile = ref<SelectedGitFile | null>(null);
const paneView = ref<PaneView>("diff");
const diffContent = ref("");
const diffLoading = ref(false);
const diffError = ref<string | null>(null);
const editContent = ref("");
const editSavedContent = ref("");
const editLoading = ref(false);
const editError = ref<string | null>(null);
const editMissing = ref(false);
const saving = ref(false);
let diffRequestId = 0;
let editRequestId = 0;

const editDirty = computed(() => editContent.value !== editSavedContent.value);

const showDiffPane = computed(() => props.panelWidth >= DIFF_PANE_MIN_WIDTH);

const canCommit = computed(
  () => props.status.isRepo && props.status.staged.length > 0 && commitMessage.value.trim().length > 0,
);

const branchSelectValue = computed(() => {
  const current = props.status.branch ?? props.branches.current;
  if (!current) return "";
  return `local:${current}`;
});

const hasBranches = computed(
  () => props.branches.local.length > 0 || props.branches.remote.length > 0,
);

type SyncOp = "fetch" | "pull" | "push" | "sync";

function syncBtnClass(op: SyncOp) {
  const active = props.operation === op;
  const base =
    "flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
  if (op === "push") {
    return [
      base,
      active
        ? "ring-1 ring-[#58a6ff] border-[#58a6ff]/60 bg-[#58a6ff]/25 text-[#58a6ff]"
        : "border-[#58a6ff]/40 bg-[#58a6ff]/10 text-[#58a6ff] hover:bg-[#58a6ff]/20",
    ];
  }
  if (op === "sync") {
    return [
      base,
      active
        ? "ring-1 ring-[var(--warp-accent)] border-[var(--warp-accent)]/60 bg-[var(--warp-accent-dim)] text-[var(--warp-accent)]"
        : "border-[var(--warp-accent)]/40 bg-[var(--warp-accent-dim)] text-[var(--warp-accent)] hover:opacity-90",
    ];
  }
  return [
    base,
    active
      ? "ring-1 ring-[var(--warp-accent)] border-[var(--warp-accent)]/40 bg-white/5 text-[var(--warp-text)]"
      : "border-[var(--warp-border)] bg-[var(--warp-bg)]/60 text-[var(--warp-text)] hover:bg-white/5",
  ];
}

const refreshSpinning = computed(() => props.operation === "refresh");

function onBranchChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  if (!value) return;
  const colon = value.indexOf(":");
  if (colon < 0) return;
  const kind = value.slice(0, colon);
  const name = value.slice(colon + 1);
  if (!name) return;
  if (kind === "local") {
    if (name === props.status.branch) return;
    emit("checkout", name, false);
    return;
  }
  if (kind === "remote") {
    emit("checkout", name, true);
  }
}

const allChangedFiles = computed(() => [
  ...props.status.staged.map((e) => ({ ...e, staged: true, untracked: false })),
  ...props.status.changes.map((e) => ({ ...e, staged: false, untracked: false })),
  ...props.status.untracked.map((e) => ({ ...e, staged: false, untracked: true })),
]);

function statusLabel(entry: GitFileEntry) {
  if (entry.untracked) return "U";
  return entry.status.toUpperCase();
}

function isSelected(entry: GitFileEntry, staged: boolean, untracked: boolean) {
  const sel = selectedFile.value;
  if (!sel) return false;
  return sel.path === entry.path && sel.staged === staged && sel.untracked === untracked;
}

function confirmDiscardEdits(): boolean {
  if (!editDirty.value) return true;
  return window.confirm("Discard unsaved changes?");
}

function selectFile(entry: GitFileEntry, staged: boolean, untracked: boolean) {
  if (
    selectedFile.value?.path === entry.path &&
    selectedFile.value.staged === staged &&
    selectedFile.value.untracked === untracked
  ) {
    return;
  }
  if (!confirmDiscardEdits()) return;
  selectedFile.value = { path: entry.path, staged, untracked };
}

function setPaneView(view: PaneView) {
  if (paneView.value === view) return;
  if (!confirmDiscardEdits()) return;
  paneView.value = view;
  const file = selectedFile.value;
  if (!file || !showDiffPane.value) return;
  if (view === "edit") {
    void loadEditContent(file);
  } else {
    void loadDiff(file);
  }
}

async function loadDiff(file: SelectedGitFile) {
  const repoRoot = props.status.repoRoot;
  if (!repoRoot) return;

  const requestId = ++diffRequestId;
  diffLoading.value = true;
  diffError.value = null;
  diffContent.value = "";

  try {
    const result = await getGitFileDiff(repoRoot, file.path, file.staged, file.untracked);
    if (requestId !== diffRequestId) return;
    diffContent.value = result.content;
  } catch (err) {
    if (requestId !== diffRequestId) return;
    diffError.value = err instanceof Error ? err.message : String(err);
  } finally {
    if (requestId === diffRequestId) {
      diffLoading.value = false;
    }
  }
}

async function loadEditContent(file: SelectedGitFile) {
  const repoRoot = props.status.repoRoot;
  if (!repoRoot) return;

  const requestId = ++editRequestId;
  editLoading.value = true;
  editError.value = null;
  editContent.value = "";
  editSavedContent.value = "";
  editMissing.value = false;

  try {
    const result = await readGitWorkingFile(repoRoot, file.path);
    if (requestId !== editRequestId) return;
    editContent.value = result.content;
    editSavedContent.value = result.content;
    editMissing.value = !result.exists;
  } catch (err) {
    if (requestId !== editRequestId) return;
    editError.value = err instanceof Error ? err.message : String(err);
  } finally {
    if (requestId === editRequestId) {
      editLoading.value = false;
    }
  }
}

async function saveEdit() {
  const file = selectedFile.value;
  const repoRoot = props.status.repoRoot;
  if (!file || !repoRoot || saving.value) return;

  saving.value = true;
  editError.value = null;

  try {
    await writeGitWorkingFile(repoRoot, file.path, editContent.value);
    editSavedContent.value = editContent.value;
    editMissing.value = false;
    emit("refresh");
    if (paneView.value === "diff") {
      void loadDiff(file);
    }
  } catch (err) {
    editError.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

function confirmRevert(paths: string[], untracked: boolean) {
  const noun = untracked ? "untracked file(s)" : "change(s)";
  const message = untracked
    ? `Delete ${paths.length} untracked ${noun}? This cannot be undone.`
    : `Discard ${paths.length} tracked ${noun}? This cannot be undone.`;
  if (!window.confirm(message)) return;
  emit("revert", paths, untracked);
}

function onCommit() {
  const message = commitMessage.value.trim();
  if (!message) return;
  emit("commit", message);
  commitMessage.value = "";
}

function rowClass(entry: GitFileEntry, staged: boolean, untracked: boolean) {
  return [
    "group flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-white/[0.03]",
    isSelected(entry, staged, untracked) ? "bg-white/[0.06]" : "",
  ];
}

watch(selectedFile, (file) => {
  if (file && showDiffPane.value) {
    if (paneView.value === "edit") {
      void loadEditContent(file);
    } else {
      void loadDiff(file);
    }
  } else {
    diffRequestId += 1;
    editRequestId += 1;
    diffContent.value = "";
    diffError.value = null;
    diffLoading.value = false;
    editContent.value = "";
    editSavedContent.value = "";
    editError.value = null;
    editLoading.value = false;
    editMissing.value = false;
  }
});

watch(showDiffPane, (visible) => {
  if (visible && !selectedFile.value && allChangedFiles.value.length > 0) {
    const first = allChangedFiles.value[0];
    selectedFile.value = {
      path: first.path,
      staged: first.staged,
      untracked: first.untracked,
    };
  }
  if (!visible) {
    diffRequestId += 1;
    diffContent.value = "";
    diffError.value = null;
    diffLoading.value = false;
  }
});

function syncSelectedFileWithStatus() {
  const sel = selectedFile.value;
  if (!sel) return;
  const stillExists = allChangedFiles.value.some(
    (f) => f.path === sel.path && f.staged === sel.staged && f.untracked === sel.untracked,
  );
  if (!stillExists) {
    selectedFile.value = null;
    return;
  }
  if (!showDiffPane.value) return;
  if (paneView.value === "edit") {
    void loadEditContent(sel);
  } else {
    void loadDiff(sel);
  }
}

watch(
  () =>
    [
      props.status.changedFiles,
      props.status.additions,
      props.status.deletions,
      props.status.staged,
      props.status.changes,
      props.status.untracked,
    ] as const,
  () => {
    if (props.status.changedFiles === 0) {
      selectedFile.value = null;
      return;
    }
    syncSelectedFileWithStatus();
  },
  { deep: true },
);
</script>

<template>
  <aside
    class="relative flex shrink-0 flex-col border-l border-[var(--warp-border)] bg-[var(--warp-sidebar)]"
    :style="{ width: `${panelWidth}px` }"
  >
  <div class="flex min-h-0 flex-1 flex-col" :class="showDiffPane ? 'flex-row' : 'flex-col'">
    <div
      class="flex min-h-0 min-w-0 flex-col"
      :class="showDiffPane ? 'max-w-[45%] min-w-[200px] border-r border-[var(--warp-border)]' : 'flex-1'"
    >
      <div class="flex items-center justify-between border-b border-[var(--warp-border)] px-3 py-2.5">
        <div class="min-w-0">
          <p
            class="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--warp-faint)]"
            style="font-family: var(--warp-font-ui)"
          >
            Source Control
          </p>
          <p
            v-if="status.upstream || status.ahead || status.behind"
            class="truncate text-xs text-[var(--warp-muted)]"
            style="font-family: var(--warp-font-ui)"
          >
            <span v-if="status.upstream">{{ status.upstream }}</span>
            <span v-if="status.upstream && (status.ahead || status.behind)"> · </span>
            <span v-if="status.ahead" class="text-[#58a6ff]">↑{{ status.ahead }}</span>
            <span v-if="status.ahead && status.behind"> · </span>
            <span v-if="status.behind" class="text-[#e3b341]">↓{{ status.behind }}</span>
          </p>
        </div>
        <button
          type="button"
          class="no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--warp-muted)] transition hover:bg-white/5 hover:text-[var(--warp-text)]"
          title="Refresh"
          aria-label="Refresh source control"
          :disabled="busy"
          @click="emit('refresh')"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            :class="refreshSpinning ? 'animate-spin' : ''"
          >
            <path
              d="M13 3v4H9M3 13V9h4"
              stroke-width="1.3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M12.5 6.5A5 5 0 0 0 4 4.5L3 6.5M3.5 9.5A5 5 0 0 0 12 11.5l1-2"
              stroke-width="1.3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <div v-if="!status.isRepo" class="px-3 py-4 text-sm text-[var(--warp-faint)]">
        Not a git repository
      </div>

      <template v-else>
        <div
          v-if="busy && operationLabel"
          class="flex items-center gap-2 border-b border-[var(--warp-border)] bg-white/[0.02] px-3 py-2"
        >
          <svg
            class="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--warp-accent)]"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="3"
            />
            <path
              class="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p class="text-xs text-[var(--warp-muted)]" style="font-family: var(--warp-font-ui)">
            {{ operationLabel }}
          </p>
        </div>

        <div class="border-b border-[var(--warp-border)] p-3">
          <label
            class="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--warp-faint)]"
            style="font-family: var(--warp-font-ui)"
          >
            Branch
          </label>
          <select
            :value="branchSelectValue"
            class="mb-3 w-full rounded-md border border-[var(--warp-border)] bg-[var(--warp-bg)] px-2.5 py-2 text-sm text-[var(--warp-text)] outline-none ring-[var(--warp-accent)] focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
            style="font-family: var(--warp-font-mono)"
            :disabled="busy || !hasBranches"
            @change="onBranchChange"
          >
            <option v-if="!hasBranches" value="" disabled>No branches</option>
            <optgroup v-if="branches.local.length" label="Local">
              <option
                v-for="branch in branches.local"
                :key="`local:${branch}`"
                :value="`local:${branch}`"
              >
                {{ branch }}
              </option>
            </optgroup>
            <optgroup v-if="branches.remote.length" label="Remote">
              <option
                v-for="branch in branches.remote"
                :key="`remote:${branch}`"
                :value="`remote:${branch}`"
              >
                {{ branch }}
              </option>
            </optgroup>
          </select>

          <div class="mb-3 grid grid-cols-4 gap-1.5">
            <button
              type="button"
              :class="syncBtnClass('fetch')"
              style="font-family: var(--warp-font-ui)"
              title="Fetch from remotes"
              :disabled="busy"
              @click="emit('fetch')"
            >
              <span v-if="operation === 'fetch'" class="inline-block h-3 w-3 animate-spin rounded-full border border-current border-r-transparent" />
              Fetch
            </button>
            <button
              type="button"
              :class="syncBtnClass('pull')"
              style="font-family: var(--warp-font-ui)"
              title="Pull from upstream"
              :disabled="busy"
              @click="emit('pull')"
            >
              <span v-if="operation === 'pull'" class="inline-block h-3 w-3 animate-spin rounded-full border border-current border-r-transparent" />
              Pull
            </button>
            <button
              type="button"
              :class="syncBtnClass('push')"
              style="font-family: var(--warp-font-ui)"
              title="Push to upstream"
              :disabled="busy"
              @click="emit('push')"
            >
              <span v-if="operation === 'push'" class="inline-block h-3 w-3 animate-spin rounded-full border border-current border-r-transparent" />
              Push
            </button>
            <button
              type="button"
              :class="syncBtnClass('sync')"
              style="font-family: var(--warp-font-ui)"
              title="Pull then push"
              :disabled="busy"
              @click="emit('sync')"
            >
              <span v-if="operation === 'sync'" class="inline-block h-3 w-3 animate-spin rounded-full border border-current border-r-transparent" />
              Sync
            </button>
          </div>

          <textarea
            v-model="commitMessage"
            rows="3"
            class="w-full resize-none rounded-md border border-[var(--warp-border)] bg-[var(--warp-bg)] px-2.5 py-2 text-sm text-[var(--warp-text)] outline-none ring-[var(--warp-accent)] placeholder:text-[var(--warp-faint)] focus:ring-1"
            style="font-family: var(--warp-font-ui)"
            placeholder="Commit message"
            :disabled="busy"
          />
          <button
            type="button"
            class="mt-2 w-full rounded-md bg-[var(--warp-accent)] px-3 py-2 text-sm font-medium text-[var(--warp-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style="font-family: var(--warp-font-ui)"
            :disabled="!canCommit || busy"
            @click="onCommit"
          >
            Commit
          </button>
          <p
            v-if="!showDiffPane && allChangedFiles.length"
            class="mt-2 text-xs text-[var(--warp-faint)]"
            style="font-family: var(--warp-font-ui)"
          >
            Drag the panel wider to view diffs
          </p>
        </div>

        <div class="warp-scroll min-h-0 flex-1 overflow-y-auto">
          <section v-if="status.staged.length" class="border-b border-[var(--warp-border)] py-2">
            <p
              class="px-3 pb-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--warp-faint)]"
              style="font-family: var(--warp-font-ui)"
            >
              Staged ({{ status.staged.length }})
            </p>
            <div
              v-for="entry in status.staged"
              :key="`staged:${entry.path}`"
              :class="rowClass(entry, true, false)"
              @click="selectFile(entry, true, false)"
            >
              <span class="w-5 shrink-0 text-xs font-medium text-[#3dd68c]">{{ statusLabel(entry) }}</span>
              <span
                class="min-w-0 flex-1 truncate text-sm text-[var(--warp-text)]"
                style="font-family: var(--warp-font-ui)"
              >{{ entry.path }}</span>
              <GitFileLineStats :additions="entry.additions" :deletions="entry.deletions" />
              <div class="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  class="flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs text-[var(--warp-faint)] hover:bg-white/5 hover:text-[var(--warp-text)]"
                  title="Unstage"
                  @click.stop="emit('unstage', [entry.path])"
                >
                  −
                </button>
              </div>
            </div>
          </section>

          <section v-if="status.changes.length" class="border-b border-[var(--warp-border)] py-2">
            <p
              class="px-3 pb-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--warp-faint)]"
              style="font-family: var(--warp-font-ui)"
            >
              Changes ({{ status.changes.length }})
            </p>
            <div
              v-for="entry in status.changes"
              :key="`changes:${entry.path}`"
              :class="rowClass(entry, false, false)"
              @click="selectFile(entry, false, false)"
            >
              <span class="w-5 shrink-0 text-xs font-medium text-[var(--warp-muted)]">{{ statusLabel(entry) }}</span>
              <span
                class="min-w-0 flex-1 truncate text-sm text-[var(--warp-text)]"
                style="font-family: var(--warp-font-ui)"
              >{{ entry.path }}</span>
              <GitFileLineStats :additions="entry.additions" :deletions="entry.deletions" />
              <div class="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  class="flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs text-[#3dd68c] hover:bg-white/5"
                  title="Stage"
                  @click.stop="emit('stage', [entry.path])"
                >
                  +
                </button>
                <button
                  type="button"
                  class="flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs text-[#ff7b72] hover:bg-white/5"
                  title="Revert"
                  @click.stop="confirmRevert([entry.path], false)"
                >
                  ↺
                </button>
              </div>
            </div>
          </section>

          <section v-if="status.untracked.length" class="border-b border-[var(--warp-border)] py-2">
            <p
              class="px-3 pb-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--warp-faint)]"
              style="font-family: var(--warp-font-ui)"
            >
              Untracked ({{ status.untracked.length }})
            </p>
            <div
              v-for="entry in status.untracked"
              :key="`untracked:${entry.path}`"
              :class="rowClass(entry, false, true)"
              @click="selectFile(entry, false, true)"
            >
              <span class="w-5 shrink-0 text-xs font-medium text-[var(--warp-faint)]">U</span>
              <span
                class="min-w-0 flex-1 truncate text-sm text-[var(--warp-text)]"
                style="font-family: var(--warp-font-ui)"
              >{{ entry.path }}</span>
              <GitFileLineStats :additions="entry.additions" :deletions="entry.deletions" />
              <div class="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  class="flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs text-[#3dd68c] hover:bg-white/5"
                  title="Stage"
                  @click.stop="emit('stage', [entry.path])"
                >
                  +
                </button>
                <button
                  type="button"
                  class="flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs text-[#ff7b72] hover:bg-white/5"
                  title="Delete"
                  @click.stop="confirmRevert([entry.path], true)"
                >
                  ×
                </button>
              </div>
            </div>
          </section>

          <section v-if="history.length" class="py-2">
            <p
              class="px-3 pb-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--warp-faint)]"
              style="font-family: var(--warp-font-ui)"
            >
              History
            </p>
            <div
              v-for="entry in history"
              :key="entry.hash"
              class="px-3 py-1.5 hover:bg-white/[0.03]"
            >
              <p
                class="truncate text-sm text-[var(--warp-text)]"
                style="font-family: var(--warp-font-ui)"
              >{{ entry.subject }}</p>
              <p
                class="mt-0.5 truncate text-xs text-[var(--warp-faint)]"
                style="font-family: var(--warp-font-mono)"
              >
                {{ entry.shortHash }} · {{ entry.author }} · {{ entry.date }}
              </p>
            </div>
          </section>

          <p
            v-if="
              !status.staged.length &&
              !status.changes.length &&
              !status.untracked.length &&
              !history.length &&
              !status.ahead &&
              !status.behind
            "
            class="px-3 py-4 text-sm text-[var(--warp-faint)]"
          >
            Working tree clean
          </p>
        </div>
      </template>
    </div>

    <div v-if="showDiffPane && status.isRepo" class="flex min-h-0 min-w-0 flex-1 flex-col">
      <div class="flex items-center gap-2 border-b border-[var(--warp-border)] px-3 py-2">
        <div class="min-w-0 flex-1">
          <p
            v-if="selectedFile"
            class="truncate text-sm text-[var(--warp-text)]"
            style="font-family: var(--warp-font-ui)"
          >
            {{ selectedFile.path }}
            <span v-if="paneView === 'edit' && editDirty" class="text-[var(--warp-faint)]"> · unsaved</span>
          </p>
          <p v-else class="text-sm text-[var(--warp-faint)]" style="font-family: var(--warp-font-ui)">
            Select a file to view changes
          </p>
        </div>
        <div v-if="selectedFile" class="flex shrink-0 items-center gap-1">
          <div
            class="flex rounded border border-[var(--warp-border)] p-0.5"
            role="tablist"
            aria-label="File pane view"
          >
            <button
              type="button"
              class="rounded px-2 py-0.5 text-xs transition"
              :class="
                paneView === 'diff'
                  ? 'bg-white/10 text-[var(--warp-text)]'
                  : 'text-[var(--warp-faint)] hover:text-[var(--warp-text)]'
              "
              style="font-family: var(--warp-font-ui)"
              @click="setPaneView('diff')"
            >
              Diff
            </button>
            <button
              type="button"
              class="rounded px-2 py-0.5 text-xs transition"
              :class="
                paneView === 'edit'
                  ? 'bg-white/10 text-[var(--warp-text)]'
                  : 'text-[var(--warp-faint)] hover:text-[var(--warp-text)]'
              "
              style="font-family: var(--warp-font-ui)"
              @click="setPaneView('edit')"
            >
              Edit
            </button>
          </div>
          <button
            v-if="paneView === 'edit' && editDirty"
            type="button"
            class="rounded border border-[var(--warp-border)] px-2 py-0.5 text-xs text-[var(--warp-text)] transition hover:bg-white/5 disabled:opacity-50"
            style="font-family: var(--warp-font-ui)"
            :disabled="saving"
            @click="saveEdit"
          >
            {{ saving ? "Saving…" : "Save" }}
          </button>
        </div>
      </div>
      <GitDiffViewer
        v-if="paneView === 'diff'"
        :content="diffContent"
        :loading="diffLoading"
        :error="diffError"
      />
      <GitFileEditor
        v-else
        v-model="editContent"
        :loading="editLoading"
        :error="editError"
        :missing="editMissing"
        @save="saveEdit"
      />
    </div>
  </div>
  </aside>
</template>
