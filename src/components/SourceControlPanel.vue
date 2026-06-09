<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  SOURCE_CONTROL_DIFF_PANE_MIN_WIDTH,
  SOURCE_CONTROL_FILE_LIST_WIDTH,
} from "../composables/useResizablePanel";
import { getCommitDetails } from "../lib/branchManagerApi";
import { getGitFileDiff, getGitStagedDiff, readGitWorkingFile, writeGitWorkingFile } from "../lib/gitApi";
import type { CommitDetails } from "../types/branchManager";
import { generateCommitAiCompletion } from "../lib/commitAiApi";
import { useCommitAiSettings } from "../lib/commitAiSettings";
import {
  commitAiProviderLabel,
  isCommitAiConfigured,
} from "../types/commitAi";
import CommitAiSettingsDialog from "./CommitAiSettingsDialog.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import type {
  GitBranchList,
  GitCommitEntry,
  GitFileEntry,
  GitOperation,
  GitSourceControlStatus,
  SelectedGitFile,
} from "../types/git";
import GitCommitGraph from "./GitCommitGraph.vue";
import GitDiffViewer from "./GitDiffViewer.vue";
import GitFileEditor from "./GitFileEditor.vue";
import GitFileLineStats from "./GitFileLineStats.vue";

type PaneView = "diff" | "edit";

type PendingConfirm = {
  title: string;
  message: string;
  confirmLabel?: string;
  dangerous?: boolean;
  onConfirm: () => void;
};

const props = defineProps<{
  status: GitSourceControlStatus;
  branches: GitBranchList;
  history: GitCommitEntry[];
  loading: boolean;
  busy: boolean;
  operation: GitOperation | null;
  operationLabel: string | null;
  panelWidth: number;
  graphRefreshToken: number;
}>();

const emit = defineEmits<{
  stage: [paths: string[]];
  unstage: [paths: string[]];
  revert: [paths: string[], untracked: boolean];
  "revert-all": [];
  commit: [message: string];
  fetch: [];
  pull: [];
  push: [];
  sync: [];
  checkout: [branch: string, remote: boolean];
  refresh: [];
  "revert-hunk": [path: string, patch: string, staged: boolean];
  "stage-hunk": [path: string, patch: string];
  "unstage-hunk": [path: string, patch: string];
  "diff-expanded-change": [expanded: boolean];
  "expand-panel": [];
}>();

const { settings: commitAiSettings } = useCommitAiSettings();

const commitMessage = ref("");
const commitAiSettingsOpen = ref(false);
const generatingCommit = ref(false);
const generateError = ref<string | null>(null);
const selectedFile = ref<SelectedGitFile | null>(null);
const selectedCommitHash = ref<string | null>(null);
const commitDetails = ref<CommitDetails | null>(null);
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
const activeHunkIndex = ref(0);
const hunkCount = ref(0);
const hunkOperationKey = ref<string | null>(null);
const hunkFeedback = ref<string | null>(null);
const hunkFeedbackError = ref(false);
const panelFeedback = ref<string | null>(null);
const panelFeedbackError = ref(false);
const diffExpanded = ref(false);
const diffPaneRef = ref<HTMLElement | null>(null);
const confirmOpen = ref(false);
const pendingConfirm = ref<PendingConfirm | null>(null);
let diffRequestId = 0;
let editRequestId = 0;

const editDirty = computed(() => editContent.value !== editSavedContent.value);

const showDiffPane = computed(() => props.panelWidth >= SOURCE_CONTROL_DIFF_PANE_MIN_WIDTH);

const canNavigateHunks = computed(
  () => paneView.value === "diff" && hunkCount.value > 0 && !diffLoading.value,
);

function goToPreviousHunk() {
  if (!canNavigateHunks.value) return;
  activeHunkIndex.value = Math.max(0, activeHunkIndex.value - 1);
}

function goToNextHunk() {
  if (!canNavigateHunks.value) return;
  activeHunkIndex.value = Math.min(hunkCount.value - 1, activeHunkIndex.value + 1);
}

function onDiffPaneKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && diffExpanded.value) {
    event.preventDefault();
    event.stopPropagation();
    setDiffExpanded(false);
    return;
  }
  if (paneView.value !== "diff") return;
  if (!event.altKey) return;
  if (event.key === "ArrowUp") {
    event.preventDefault();
    goToPreviousHunk();
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    goToNextHunk();
  }
}

function setDiffExpanded(expanded: boolean) {
  if (diffExpanded.value === expanded) return;
  diffExpanded.value = expanded;
  emit("diff-expanded-change", expanded);
}

function toggleDiffExpanded() {
  setDiffExpanded(!diffExpanded.value);
}

function showHunkFeedback(message: string, isError = false) {
  hunkFeedback.value = message;
  hunkFeedbackError.value = isError;
  window.setTimeout(() => {
    hunkFeedback.value = null;
    hunkFeedbackError.value = false;
  }, isError ? 4000 : 2000);
}

function showPanelFeedback(message: string, isError = false) {
  panelFeedback.value = message;
  panelFeedbackError.value = isError;
  window.setTimeout(() => {
    panelFeedback.value = null;
    panelFeedbackError.value = false;
  }, isError ? 6000 : 2500);
}

function onRevertHunk(patch: string, opKey: string) {
  const file = selectedFile.value;
  if (!file) return;
  hunkOperationKey.value = opKey;
  emit("revert-hunk", file.path, patch, file.staged);
}

function onStageHunk(patch: string, opKey: string) {
  const file = selectedFile.value;
  if (!file) return;
  hunkOperationKey.value = opKey;
  emit("stage-hunk", file.path, patch);
}

function onUnstageHunk(patch: string, opKey: string) {
  const file = selectedFile.value;
  if (!file) return;
  hunkOperationKey.value = opKey;
  emit("unstage-hunk", file.path, patch);
}

watch(
  () => props.busy,
  (isBusy, wasBusy) => {
    if (wasBusy && !isBusy) {
      hunkOperationKey.value = null;
    }
  },
);

function clearHunkOperation() {
  hunkOperationKey.value = null;
}

defineExpose({
  showHunkFeedback,
  showPanelFeedback,
  clearHunkOperation,
  collapseDiffExpanded: () => setDiffExpanded(false),
});

const canCommit = computed(
  () => props.status.isRepo && props.status.staged.length > 0 && commitMessage.value.trim().length > 0,
);

const canGenerateCommit = computed(
  () =>
    props.status.isRepo &&
    props.status.staged.length > 0 &&
    isCommitAiConfigured(commitAiSettings.value) &&
    !props.busy &&
    !generatingCommit.value,
);

const commitAiSummary = computed(() => {
  const settings = commitAiSettings.value;
  if (!settings.model.trim()) return null;
  const provider = commitAiProviderLabel(settings.provider);
  return settings.model.trim() ? `${provider} · ${settings.model.trim()}` : provider;
});

function cleanGeneratedCommitMessage(raw: string) {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```[\w-]*\n?/, "").replace(/\n?```$/, "").trim();
  }
  return text;
}

async function onGenerateCommitMessage() {
  const repoRoot = props.status.repoRoot;
  if (!repoRoot || !canGenerateCommit.value) return;

  generatingCommit.value = true;
  generateError.value = null;
  try {
    const staged = await getGitStagedDiff(repoRoot);
    const userPrompt = [
      "Write a single git commit message for the staged changes below.",
      "Return only the commit message text with no explanation or markdown fencing.",
      "",
      "## Staged summary",
      staged.stat.trim() || "(no stat output)",
      "",
      "## Staged diff",
      staged.diff.trim() || "(empty diff)",
    ].join("\n");

    const generated = await generateCommitAiCompletion(
      commitAiSettings.value.endpoint,
      commitAiSettings.value.provider,
      commitAiSettings.value.model,
      commitAiSettings.value.prompts.commitMessage,
      userPrompt,
      commitAiSettings.value.apiKey,
    );
    commitMessage.value = cleanGeneratedCommitMessage(generated);
  } catch (err) {
    generateError.value = err instanceof Error ? err.message : String(err);
  } finally {
    generatingCommit.value = false;
  }
}

const stageAllPaths = computed(() => [
  ...props.status.changes.map((e) => e.path),
  ...props.status.untracked.map((e) => e.path),
]);

const unstageAllPaths = computed(() => props.status.staged.map((e) => e.path));

const canStageAll = computed(() => stageAllPaths.value.length > 0);

const canUnstageAll = computed(() => unstageAllPaths.value.length > 0);

const canRevertAll = computed(
  () =>
    props.status.changes.length > 0 ||
    props.status.staged.length > 0 ||
    props.status.untracked.length > 0,
);

function askConfirm(options: PendingConfirm) {
  pendingConfirm.value = options;
  confirmOpen.value = true;
}

function resolveConfirm(confirmed: boolean) {
  const pending = pendingConfirm.value;
  confirmOpen.value = false;
  pendingConfirm.value = null;
  if (confirmed) pending?.onConfirm();
}

function onStageAll() {
  if (stageAllPaths.value.length) emit("stage", stageAllPaths.value);
}

function onUnstageAll() {
  if (unstageAllPaths.value.length) emit("unstage", unstageAllPaths.value);
}

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
        ? "ring-1 ring-[var(--oterm-accent)] border-[var(--oterm-accent)]/60 bg-[var(--oterm-accent-dim)] text-[var(--oterm-accent)]"
        : "border-[var(--oterm-accent)]/40 bg-[var(--oterm-accent-dim)] text-[var(--oterm-accent)] hover:opacity-90",
    ];
  }
  return [
    base,
    active
      ? "ring-1 ring-[var(--oterm-accent)] border-[var(--oterm-accent)]/40 bg-white/5 text-[var(--oterm-text)]"
      : "border-[var(--oterm-border)] bg-[var(--oterm-bg)]/60 text-[var(--oterm-text)] hover:bg-white/5",
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

function selectCommit(hash: string) {
  if (selectedCommitHash.value === hash) return;
  if (!confirmDiscardEdits()) return;
  selectedCommitHash.value = hash;
  selectedFile.value = null;
  paneView.value = "diff";
  activeHunkIndex.value = 0;
  void loadCommitDiff(hash);
  emit("expand-panel");
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
  selectedCommitHash.value = null;
  commitDetails.value = null;
  selectedFile.value = { path: entry.path, staged, untracked };
  activeHunkIndex.value = 0;
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
  commitDetails.value = null;
  activeHunkIndex.value = 0;

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

async function loadCommitDiff(hash: string) {
  const repoRoot = props.status.repoRoot;
  if (!repoRoot) return;

  const requestId = ++diffRequestId;
  diffLoading.value = true;
  diffError.value = null;
  diffContent.value = "";
  commitDetails.value = null;
  activeHunkIndex.value = 0;

  try {
    const details = await getCommitDetails(repoRoot, hash);
    if (requestId !== diffRequestId) return;
    commitDetails.value = details;
    diffContent.value = details.diff;
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
  askConfirm({
    title: untracked ? "Delete untracked files?" : "Revert changes?",
    message,
    confirmLabel: untracked ? "Delete" : "Revert",
    dangerous: true,
    onConfirm: () => emit("revert", paths, untracked),
  });
}

function onRevertAll() {
  if (!canRevertAll.value) return;
  askConfirm({
    title: "Revert all changes?",
    message:
      "Are you sure you want to revert all changes? This will discard staged and unstaged changes, delete untracked files, and cannot be undone.",
    confirmLabel: "Revert all",
    dangerous: true,
    onConfirm: () => emit("revert-all"),
  });
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
  } else if (!selectedCommitHash.value) {
    setDiffExpanded(false);
    diffRequestId += 1;
    editRequestId += 1;
    diffContent.value = "";
    diffError.value = null;
    diffLoading.value = false;
    commitDetails.value = null;
    editContent.value = "";
    editSavedContent.value = "";
    editError.value = null;
    editLoading.value = false;
    editMissing.value = false;
  }
});

watch(
  () => props.graphRefreshToken,
  () => {
    if (selectedCommitHash.value) {
      void loadCommitDiff(selectedCommitHash.value);
    }
  },
);

watch(showDiffPane, (visible) => {
  if (visible && !selectedFile.value && !selectedCommitHash.value && allChangedFiles.value.length > 0) {
    const first = allChangedFiles.value[0];
    selectedFile.value = {
      path: first.path,
      staged: first.staged,
      untracked: first.untracked,
    };
  }
  if (visible && selectedCommitHash.value) {
    void loadCommitDiff(selectedCommitHash.value);
  } else if (visible && selectedFile.value) {
    if (paneView.value === "edit") {
      void loadEditContent(selectedFile.value);
    } else {
      void loadDiff(selectedFile.value);
    }
  }
  if (!visible) {
    setDiffExpanded(false);
    diffRequestId += 1;
    diffContent.value = "";
    diffError.value = null;
    diffLoading.value = false;
  }
});

watch(diffExpanded, async (expanded) => {
  if (!expanded) return;
  await nextTick();
  diffPaneRef.value?.focus();
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
    class="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--oterm-sidebar)]"
  >
  <div class="flex min-h-0 flex-1 flex-col" :class="showDiffPane ? 'flex-row' : 'flex-col'">
    <div
      class="flex min-h-0 shrink-0 flex-col"
      :style="{ width: showDiffPane ? `${SOURCE_CONTROL_FILE_LIST_WIDTH}px` : undefined }"
      :class="showDiffPane ? 'border-r border-[var(--oterm-border)]' : 'min-w-0 flex-1'"
    >
      <div class="flex items-center justify-between border-b border-[var(--oterm-border)] px-3 py-2.5">
        <div class="min-w-0">
          <p
            class="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--oterm-faint)]"
            style="font-family: var(--oterm-font-ui)"
          >
            Source Control
          </p>
          <p
            v-if="status.upstream || status.ahead || status.behind"
            class="truncate text-xs text-[var(--oterm-muted)]"
            style="font-family: var(--oterm-font-ui)"
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
          class="no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)]"
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

      <div v-if="!status.isRepo" class="px-3 py-4 text-sm text-[var(--oterm-faint)]">
        Not a git repository
      </div>

      <template v-else>
        <div
          v-if="busy && operationLabel"
          class="flex items-center gap-2 border-b border-[var(--oterm-border)] bg-white/[0.02] px-3 py-2"
        >
          <svg
            class="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--oterm-accent)]"
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
          <p class="text-xs text-[var(--oterm-muted)]" style="font-family: var(--oterm-font-ui)">
            {{ operationLabel }}
          </p>
        </div>

        <div class="border-b border-[var(--oterm-border)] p-3">
          <label
            class="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--oterm-faint)]"
            style="font-family: var(--oterm-font-ui)"
          >
            Branch
          </label>
          <select
            :value="branchSelectValue"
            class="mb-3 w-full rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)] px-2.5 py-2 text-sm text-[var(--oterm-text)] outline-none ring-[var(--oterm-accent)] focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
            style="font-family: var(--oterm-font-mono)"
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
              style="font-family: var(--oterm-font-ui)"
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
              style="font-family: var(--oterm-font-ui)"
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
              style="font-family: var(--oterm-font-ui)"
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
              style="font-family: var(--oterm-font-ui)"
              title="Pull (rebase) then push"
              :disabled="busy"
              @click="emit('sync')"
            >
              <span v-if="operation === 'sync'" class="inline-block h-3 w-3 animate-spin rounded-full border border-current border-r-transparent" />
              Sync
            </button>
          </div>

          <p
            v-if="panelFeedback"
            class="mb-3 rounded-md border px-2.5 py-2 text-xs leading-snug"
            :class="
              panelFeedbackError
                ? 'border-red-500/40 bg-red-500/10 text-red-200'
                : 'border-[var(--oterm-border)] bg-white/[0.03] text-[var(--oterm-muted)]'
            "
            style="font-family: var(--oterm-font-ui)"
          >
            {{ panelFeedback }}
          </p>

          <div class="mb-1.5 flex items-center justify-between gap-2">
            <span class="text-[10px] uppercase tracking-wide text-[var(--oterm-faint)]">Commit message</span>
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--oterm-border)] text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)]"
                style="font-family: var(--oterm-font-ui)"
                title="Commit message AI settings"
                aria-label="Commit message AI settings"
                @click="commitAiSettingsOpen = true"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
                  <circle cx="8" cy="8" r="2.25" stroke-width="1.4" />
                  <path
                    d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"
                    stroke-width="1.2"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="rounded-md border border-[var(--oterm-border)] px-2 py-1 text-[10px] text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)] disabled:cursor-not-allowed disabled:opacity-40"
                style="font-family: var(--oterm-font-ui)"
                title="Generate commit message with AI"
                :disabled="!canGenerateCommit"
                @click="onGenerateCommitMessage"
              >
                <span
                  v-if="generatingCommit"
                  class="mr-1 inline-block h-2.5 w-2.5 animate-spin rounded-full border border-current border-r-transparent"
                />
                Generate
              </button>
            </div>
          </div>
          <textarea
            v-model="commitMessage"
            rows="3"
            class="w-full resize-none rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)] px-2.5 py-2 text-sm text-[var(--oterm-text)] outline-none ring-[var(--oterm-accent)] placeholder:text-[var(--oterm-faint)] focus:ring-1"
            style="font-family: var(--oterm-font-ui)"
            placeholder="Commit message"
            :disabled="busy || generatingCommit"
          />
          <p
            v-if="generateError"
            class="mt-1 text-xs text-[var(--oterm-danger)]"
            style="font-family: var(--oterm-font-ui)"
          >
            {{ generateError }}
          </p>
          <p
            v-else-if="commitAiSummary"
            class="mt-1 truncate text-xs text-[var(--oterm-faint)]"
            style="font-family: var(--oterm-font-ui)"
          >
            {{ commitAiSummary }}
          </p>
          <p
            v-else
            class="mt-1 text-xs text-[var(--oterm-faint)]"
            style="font-family: var(--oterm-font-ui)"
          >
            Open AI settings to choose a provider and model.
          </p>
          <button
            type="button"
            class="mt-2 w-full rounded-md bg-[var(--oterm-accent)] px-3 py-2 text-sm font-medium text-[var(--oterm-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style="font-family: var(--oterm-font-ui)"
            :disabled="!canCommit || busy"
            @click="onCommit"
          >
            Commit
          </button>
          <p
            v-if="!showDiffPane && allChangedFiles.length"
            class="mt-2 text-xs text-[var(--oterm-faint)]"
            style="font-family: var(--oterm-font-ui)"
          >
            Drag the panel wider to view diffs
          </p>
          <div class="mt-2 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/60 px-2 py-1.5 text-xs font-medium text-[#3dd68c] transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              style="font-family: var(--oterm-font-ui)"
              title="Stage all changes and untracked files"
              :disabled="busy || !canStageAll"
              @click="onStageAll"
            >
              Stage all
            </button>
            <button
              type="button"
              class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/60 px-2 py-1.5 text-xs font-medium text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)] disabled:cursor-not-allowed disabled:opacity-40"
              style="font-family: var(--oterm-font-ui)"
              title="Unstage all staged files"
              :disabled="busy || !canUnstageAll"
              @click="onUnstageAll"
            >
              Unstage all
            </button>
          </div>
          <button
            type="button"
            class="mt-1.5 w-full rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/60 px-2 py-1.5 text-xs font-medium text-[#ff7b72] transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            style="font-family: var(--oterm-font-ui)"
            title="Revert all staged, unstaged, and untracked changes"
            :disabled="busy || !canRevertAll"
            @click="onRevertAll"
          >
            Revert all
          </button>
        </div>

        <div class="oterm-scroll min-h-0 flex-1 overflow-y-auto">
          <section v-if="status.staged.length" class="border-b border-[var(--oterm-border)] py-2">
            <p
              class="px-3 pb-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--oterm-faint)]"
              style="font-family: var(--oterm-font-ui)"
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
                class="min-w-0 flex-1 truncate text-sm text-[var(--oterm-text)]"
                style="font-family: var(--oterm-font-ui)"
              >{{ entry.path }}</span>
              <GitFileLineStats :additions="entry.additions" :deletions="entry.deletions" />
              <div class="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  class="flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs text-[var(--oterm-faint)] hover:bg-white/5 hover:text-[var(--oterm-text)]"
                  title="Unstage"
                  @click.stop="emit('unstage', [entry.path])"
                >
                  −
                </button>
              </div>
            </div>
          </section>

          <section v-if="status.changes.length" class="border-b border-[var(--oterm-border)] py-2">
            <p
              class="px-3 pb-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--oterm-faint)]"
              style="font-family: var(--oterm-font-ui)"
            >
              Changes ({{ status.changes.length }})
            </p>
            <div
              v-for="entry in status.changes"
              :key="`changes:${entry.path}`"
              :class="rowClass(entry, false, false)"
              @click="selectFile(entry, false, false)"
            >
              <span class="w-5 shrink-0 text-xs font-medium text-[var(--oterm-muted)]">{{ statusLabel(entry) }}</span>
              <span
                class="min-w-0 flex-1 truncate text-sm text-[var(--oterm-text)]"
                style="font-family: var(--oterm-font-ui)"
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

          <section v-if="status.untracked.length" class="border-b border-[var(--oterm-border)] py-2">
            <p
              class="px-3 pb-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--oterm-faint)]"
              style="font-family: var(--oterm-font-ui)"
            >
              Untracked ({{ status.untracked.length }})
            </p>
            <div
              v-for="entry in status.untracked"
              :key="`untracked:${entry.path}`"
              :class="rowClass(entry, false, true)"
              @click="selectFile(entry, false, true)"
            >
              <span class="w-5 shrink-0 text-xs font-medium text-[var(--oterm-faint)]">U</span>
              <span
                class="min-w-0 flex-1 truncate text-sm text-[var(--oterm-text)]"
                style="font-family: var(--oterm-font-ui)"
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

          <GitCommitGraph
            v-if="status.isRepo && status.repoRoot"
            :repo-root="status.repoRoot"
            :ahead="status.ahead"
            :behind="status.behind"
            :selected-hash="selectedCommitHash"
            :refresh-token="graphRefreshToken"
            @select-commit="selectCommit"
            @expand-panel="emit('expand-panel')"
          />

          <section v-if="history.length" class="py-2">
            <p
              class="px-3 pb-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--oterm-faint)]"
              style="font-family: var(--oterm-font-ui)"
            >
              History
            </p>
            <div
              v-for="entry in history"
              :key="entry.hash"
              class="px-3 py-1.5 hover:bg-white/[0.03]"
            >
              <p
                class="truncate text-sm text-[var(--oterm-text)]"
                style="font-family: var(--oterm-font-ui)"
              >{{ entry.subject }}</p>
              <p
                class="mt-0.5 truncate text-xs text-[var(--oterm-faint)]"
                style="font-family: var(--oterm-font-mono)"
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
            class="px-3 py-4 text-sm text-[var(--oterm-faint)]"
          >
            Working tree clean
          </p>
        </div>
      </template>
    </div>

    <div
      v-if="showDiffPane && status.isRepo"
      ref="diffPaneRef"
      class="flex min-h-0 min-w-0 flex-1 flex-col outline-none"
      :class="diffExpanded ? 'diff-pane-expanded' : ''"
      tabindex="0"
      @keydown="onDiffPaneKeydown"
    >
      <div class="flex items-center gap-2 border-b border-[var(--oterm-border)] px-3 py-2">
        <div class="min-w-0 flex-1">
          <p
            v-if="selectedCommitHash && commitDetails"
            class="truncate text-sm text-[var(--oterm-text)]"
            style="font-family: var(--oterm-font-ui)"
          >
            {{ commitDetails.subject }}
            <span class="text-[var(--oterm-faint)]"> · {{ commitDetails.shortHash }}</span>
          </p>
          <p
            v-else-if="selectedCommitHash"
            class="truncate text-sm text-[var(--oterm-faint)]"
            style="font-family: var(--oterm-font-mono)"
          >
            {{ selectedCommitHash.slice(0, 7) }}
          </p>
          <p
            v-else-if="selectedFile"
            class="truncate text-sm text-[var(--oterm-text)]"
            style="font-family: var(--oterm-font-ui)"
          >
            {{ selectedFile.path }}
            <span v-if="paneView === 'edit' && editDirty" class="text-[var(--oterm-faint)]"> · unsaved</span>
          </p>
          <p v-else class="text-sm text-[var(--oterm-faint)]" style="font-family: var(--oterm-font-ui)">
            Select a file or commit to view changes
          </p>
          <p
            v-if="selectedCommitHash && commitDetails"
            class="mt-0.5 truncate text-xs text-[var(--oterm-faint)]"
            style="font-family: var(--oterm-font-ui)"
          >
            {{ commitDetails.author }} · {{ commitDetails.date }}
          </p>
        </div>
        <div v-if="selectedFile" class="flex shrink-0 items-center gap-1">
          <div
            v-if="paneView === 'diff' && canNavigateHunks"
            class="mr-1 flex items-center gap-1 text-xs text-[var(--oterm-faint)]"
            style="font-family: var(--oterm-font-ui)"
          >
            <button
              type="button"
              class="rounded px-1.5 py-0.5 transition hover:bg-white/5 hover:text-[var(--oterm-text)] disabled:opacity-40"
              title="Previous hunk (Alt+↑)"
              :disabled="activeHunkIndex <= 0"
              @click="goToPreviousHunk"
            >
              ‹
            </button>
            <span>{{ activeHunkIndex + 1 }} / {{ hunkCount }}</span>
            <button
              type="button"
              class="rounded px-1.5 py-0.5 transition hover:bg-white/5 hover:text-[var(--oterm-text)] disabled:opacity-40"
              title="Next hunk (Alt+↓)"
              :disabled="activeHunkIndex >= hunkCount - 1"
              @click="goToNextHunk"
            >
              ›
            </button>
          </div>
          <div
            class="flex rounded border border-[var(--oterm-border)] p-0.5"
            role="tablist"
            aria-label="File pane view"
          >
            <button
              type="button"
              class="rounded px-2 py-0.5 text-xs transition"
              :class="
                paneView === 'diff'
                  ? 'bg-white/10 text-[var(--oterm-text)]'
                  : 'text-[var(--oterm-faint)] hover:text-[var(--oterm-text)]'
              "
              style="font-family: var(--oterm-font-ui)"
              @click="setPaneView('diff')"
            >
              Diff
            </button>
            <button
              type="button"
              class="rounded px-2 py-0.5 text-xs transition"
              :class="
                paneView === 'edit'
                  ? 'bg-white/10 text-[var(--oterm-text)]'
                  : 'text-[var(--oterm-faint)] hover:text-[var(--oterm-text)]'
              "
              style="font-family: var(--oterm-font-ui)"
              @click="setPaneView('edit')"
            >
              Edit
            </button>
          </div>
          <button
            v-if="paneView === 'edit' && editDirty"
            type="button"
            class="rounded border border-[var(--oterm-border)] px-2 py-0.5 text-xs text-[var(--oterm-text)] transition hover:bg-white/5 disabled:opacity-50"
            style="font-family: var(--oterm-font-ui)"
            :disabled="saving"
            @click="saveEdit"
          >
            {{ saving ? "Saving…" : "Save" }}
          </button>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)]"
            :title="diffExpanded ? 'Exit full screen (Esc)' : 'Expand diff/editor'"
            :aria-label="diffExpanded ? 'Exit full screen' : 'Expand diff/editor'"
            @click="toggleDiffExpanded"
          >
            <svg
              v-if="diffExpanded"
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                d="M5 2H2v3M11 2h3v3M5 14H2v-3M11 14h3v-3"
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
                d="M3 3h4M3 3v4M13 3H9M13 3v4M3 13h4M3 13V9M13 13H9M13 13V9"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      <GitDiffViewer
        v-if="paneView === 'diff'"
        :content="diffContent"
        :loading="diffLoading"
        :error="diffError"
        :selected-file="selectedFile"
        :busy="busy"
        :hunk-operation-key="hunkOperationKey"
        :active-hunk-index="activeHunkIndex"
        :feedback="hunkFeedback"
        :feedback-error="hunkFeedbackError"
        @update:active-hunk-index="activeHunkIndex = $event"
        @hunk-count="hunkCount = $event"
        @revert-hunk="onRevertHunk"
        @stage-hunk="onStageHunk"
        @unstage-hunk="onUnstageHunk"
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

    <CommitAiSettingsDialog
      :open="commitAiSettingsOpen"
      @close="commitAiSettingsOpen = false"
    />

    <ConfirmDialog
      :open="confirmOpen"
      :title="pendingConfirm?.title ?? ''"
      :message="pendingConfirm?.message ?? ''"
      :confirm-label="pendingConfirm?.confirmLabel"
      :dangerous="pendingConfirm?.dangerous"
      @confirm="resolveConfirm(true)"
      @cancel="resolveConfirm(false)"
    />
  </aside>
</template>

<style scoped>
.diff-pane-expanded {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: var(--oterm-bg);
}
</style>
