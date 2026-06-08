<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { getGitFileDiff, readGitWorkingFile, writeGitWorkingFile } from "../lib/gitApi";
import type { GitCommitEntry, GitFileEntry, GitSourceControlStatus, SelectedGitFile } from "../types/git";
import GitDiffViewer from "./GitDiffViewer.vue";
import GitFileEditor from "./GitFileEditor.vue";
import GitFileLineStats from "./GitFileLineStats.vue";

type PaneView = "diff" | "edit";

const DIFF_PANE_MIN_WIDTH = 520;

const props = defineProps<{
  status: GitSourceControlStatus;
  history: GitCommitEntry[];
  loading: boolean;
  panelWidth: number;
}>();

const emit = defineEmits<{
  stage: [paths: string[]];
  unstage: [paths: string[]];
  revert: [paths: string[], untracked: boolean];
  commit: [message: string];
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
            v-if="status.branch"
            class="truncate text-sm text-[var(--warp-text)]"
            style="font-family: var(--warp-font-ui)"
          >
            {{ status.branch }}
          </p>
        </div>
        <button
          type="button"
          class="no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--warp-muted)] transition hover:bg-white/5 hover:text-[var(--warp-text)]"
          title="Refresh"
          aria-label="Refresh source control"
          :disabled="loading"
          @click="emit('refresh')"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor">
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
        <div class="border-b border-[var(--warp-border)] p-3">
          <textarea
            v-model="commitMessage"
            rows="3"
            class="w-full resize-none rounded-md border border-[var(--warp-border)] bg-[var(--warp-bg)] px-2.5 py-2 text-sm text-[var(--warp-text)] outline-none ring-[var(--warp-accent)] placeholder:text-[var(--warp-faint)] focus:ring-1"
            style="font-family: var(--warp-font-ui)"
            placeholder="Commit message"
            :disabled="loading"
          />
          <button
            type="button"
            class="mt-2 w-full rounded-md bg-[var(--warp-accent)] px-3 py-2 text-sm font-medium text-[var(--warp-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style="font-family: var(--warp-font-ui)"
            :disabled="!canCommit || loading"
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
            v-if="!status.staged.length && !status.changes.length && !status.untracked.length && !history.length"
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
