<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { SelectedGitFile } from "../types/git";
import type {
  SourceControlAgentRequest,
  SourceControlComment,
  SourceControlReviewDraft,
  SourceControlReviewRange,
} from "../lib/sourceControlAgent";
import { buildSourceControlFeedbackPrompt } from "../lib/sourceControlAgent";
import {
  getSourceControlReviewDraft,
  setSourceControlReviewDraft,
} from "../lib/sourceControlDrafts";
import { writeClipboardText } from "../lib/clipboard";
import { pushAppToast } from "../lib/appToast";

const props = withDefaults(
  defineProps<{
    repoRoot: string | null;
    scopeKey?: string | null;
    selectedFile?: SelectedGitFile | null;
    selectedRange?: SourceControlReviewRange | null;
    agentName?: string | null;
    agentHandoffBusy?: boolean;
    disabled?: boolean;
  }>(),
  {
    scopeKey: null,
    selectedFile: null,
    selectedRange: null,
    agentName: null,
    agentHandoffBusy: false,
    disabled: false,
  },
);

const emit = defineEmits<{
  "clear-range": [];
  "agent-request": [request: SourceControlAgentRequest];
}>();

const draft = ref<SourceControlReviewDraft>({
  comments: [],
  editor: {
    id: null,
    file: null,
    range: null,
    body: "",
  },
});

function loadDraft() {
  draft.value = getSourceControlReviewDraft(props.scopeKey, props.repoRoot);
  if (!draft.value.editor.body && !draft.value.editor.id && !draft.value.editor.range) {
    draft.value.editor.file = props.selectedFile ? { ...props.selectedFile } : null;
  }
}

function persistDraft() {
  setSourceControlReviewDraft(props.scopeKey, props.repoRoot, draft.value);
}

watch(
  () => [props.scopeKey, props.repoRoot],
  () => {
    loadDraft();
  },
  { immediate: true },
);

// When selectedRange changes from GitDiffViewer:
// Never retarget unfinished text/range when selectedRange watcher fires, even same file; require save/clear first
watch(
  () => props.selectedRange,
  (newRange) => {
    if (!newRange) return;
    if (!props.selectedFile) return;

    const editor = draft.value.editor;
    if (editor.body.trim() || editor.id) {
      if (!isSameFile(editor.file, props.selectedFile) || !editor.range ||
        editor.range.side !== newRange.side || editor.range.start !== newRange.start ||
        editor.range.end !== newRange.end || editor.range.hunkHeader !== newRange.hunkHeader ||
        editor.range.excerpt !== newRange.excerpt) {
        emit("clear-range");
        pushAppToast(editor.id
          ? "Save or cancel your current comment before selecting other lines."
          : "Save or clear the current comment before selecting other lines.", "warning");
      }
      return;
    }

    draft.value.editor.id = null;
    draft.value.editor.file = { ...props.selectedFile };
    draft.value.editor.range = { ...newRange };
    persistDraft();
  },
);

// When selectedFile changes:
// Never retarget an unfinished comment with text
watch(
  () => props.selectedFile,
  (newFile) => {
    if (draft.value.editor.body.trim()) {
      return;
    }
    if (!draft.value.editor.id) {
      draft.value.editor.file = newFile ? { ...newFile } : null;
      draft.value.editor.range = null;
      persistDraft();
    }
  },
);

const activeTargetFile = computed<SelectedGitFile | null>(() => {
  return draft.value.editor.file ?? props.selectedFile ?? null;
});

const canSaveComment = computed(() => {
  return Boolean(draft.value.editor.body.trim() && activeTargetFile.value);
});

function isSameFile(
  a: SelectedGitFile | null | undefined,
  b: SelectedGitFile | null | undefined,
): boolean {
  if (!a || !b) return a === b;
  return a.path === b.path && a.staged === b.staged && a.untracked === b.untracked;
}

function fileDomain(file: SelectedGitFile | null | undefined): string {
  if (!file) return "";
  if (file.untracked) return "Untracked";
  if (file.staged) return "Staged";
  return "Unstaged";
}

function rangeLabel(range: SourceControlReviewRange | null | undefined): string {
  if (!range) return "File";
  const span = range.start === range.end ? `L${range.start}` : `L${range.start}–L${range.end}`;
  return `${range.side} ${span}`;
}

function clearEditorRange() {
  draft.value.editor.range = null;
  persistDraft();
  emit("clear-range");
}

function onAddFileComment() {
  if (!props.selectedFile) return;

  if (draft.value.editor.body.trim()) {
    onSaveComment();
  }

  draft.value.editor = {
    id: null,
    file: { ...props.selectedFile },
    range: null,
    body: "",
  };
  emit("clear-range");
  persistDraft();
}

function onSaveComment() {
  const body = draft.value.editor.body.trim();
  if (!body) return;

  const targetFile = activeTargetFile.value;
  if (!targetFile) return;

  if (draft.value.editor.id) {
    const idx = draft.value.comments.findIndex((c) => c.id === draft.value.editor.id);
    if (idx !== -1) {
      draft.value.comments[idx] = {
        id: draft.value.editor.id,
        file: { ...targetFile },
        range: draft.value.editor.range ? { ...draft.value.editor.range } : null,
        body,
      };
    }
  } else {
    draft.value.comments.push({
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file: { ...targetFile },
      range: draft.value.editor.range ? { ...draft.value.editor.range } : null,
      body,
    });
  }

  draft.value.editor = {
    id: null,
    file: props.selectedFile ? { ...props.selectedFile } : null,
    range: null,
    body: "",
  };
  emit("clear-range");
  persistDraft();
}

function isEditDisabled(comment: SourceControlComment): boolean {
  return Boolean(draft.value.editor.body.trim() && draft.value.editor.id !== comment.id);
}

function onEditComment(comment: SourceControlComment) {
  if (draft.value.editor.id === comment.id || isEditDisabled(comment)) return;

  draft.value.editor = {
    id: comment.id,
    file: { ...comment.file },
    range: comment.range ? { ...comment.range } : null,
    body: comment.body,
  };
  persistDraft();
}

function onCancelEdit() {
  draft.value.editor = {
    id: null,
    file: props.selectedFile ? { ...props.selectedFile } : null,
    range: null,
    body: "",
  };
  emit("clear-range");
  persistDraft();
}

function onDeleteComment(commentId: string) {
  draft.value.comments = draft.value.comments.filter((c) => c.id !== commentId);
  if (draft.value.editor.id === commentId) {
    onCancelEdit();
  } else {
    persistDraft();
  }
}

function onClearAllComments() {
  draft.value.comments = [];
  if (draft.value.editor.id) {
    onCancelEdit();
  } else {
    persistDraft();
  }
}

function onEditorEscape(event: KeyboardEvent) {
  if (draft.value.editor.id) {
    event.stopPropagation();
    onCancelEdit();
    return;
  }
  if (draft.value.editor.range) {
    event.stopPropagation();
    clearEditorRange();
    return;
  }
  event.stopPropagation();
  (event.target as HTMLElement | null)?.blur?.();
}

async function onCopyFeedback() {
  if (!props.repoRoot || !draft.value.comments.length) {
    pushAppToast("No review comments to copy", "warning");
    return;
  }
  try {
    const text = buildSourceControlFeedbackPrompt(props.repoRoot, draft.value.comments);
    await writeClipboardText(text);
    pushAppToast("Review feedback copied to clipboard", "success");
  } catch (err) {
    pushAppToast(err instanceof Error ? err.message : "Failed to copy review feedback", "error");
  }
}

function onSendToAgent() {
  if (
    !props.repoRoot ||
    !props.agentName ||
    !draft.value.comments.length ||
    props.disabled ||
    props.agentHandoffBusy
  ) {
    return;
  }
  try {
    const prompt = buildSourceControlFeedbackPrompt(props.repoRoot, draft.value.comments);
    emit("agent-request", {
      scopeKey: props.scopeKey ?? "",
      repoRoot: props.repoRoot,
      prompt,
    });
  } catch (err) {
    pushAppToast(err instanceof Error ? err.message : "Failed to send review feedback", "error");
  }
}
</script>

<template>
  <div class="review-panel flex flex-col gap-2 p-3 text-xs" style="font-family: var(--oterm-font-ui)">
    <!-- Header / Summary Bar -->
    <div class="flex items-center justify-between gap-2 border-b border-[var(--oterm-border)] pb-2">
      <div class="flex items-center gap-1.5 min-w-0">
        <span class="font-semibold uppercase tracking-[0.06em] text-[var(--oterm-faint)]">
          Review Comments
        </span>
        <span
          v-if="draft.comments.length"
          class="rounded-full bg-white/10 px-1.5 py-0.2 text-[10px] font-medium text-[var(--oterm-text)]"
        >
          {{ draft.comments.length }}
        </span>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button
          v-if="draft.comments.length"
          type="button"
          class="rounded border border-[var(--oterm-border)] px-2 py-0.5 text-[11px] text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)]"
          title="Copy review feedback prompt to clipboard"
          @click="onCopyFeedback"
        >
          Copy feedback
        </button>
        <button
          v-if="draft.comments.length"
          type="button"
          class="rounded border border-[var(--oterm-border)] px-2 py-0.5 text-[11px] text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)] disabled:cursor-not-allowed disabled:opacity-40"
          :title="agentName ? `Immediately submit review feedback to running ${agentName} in terminal. Finish any existing terminal prompt first.` : 'No active CLI agent detected in terminal. Open an agent in terminal or use Copy feedback.'"
          :disabled="disabled || agentHandoffBusy || !agentName"
          :aria-disabled="disabled || agentHandoffBusy || !agentName"
          @click="onSendToAgent"
        >
          <span
            v-if="agentHandoffBusy"
            class="mr-1 inline-block h-2 w-2 animate-spin rounded-full border border-current border-r-transparent"
          />
          {{ agentName ? `Send to ${agentName}` : "Send to agent" }}
        </button>
        <button
          v-if="draft.comments.length"
          type="button"
          class="rounded p-1 text-[var(--oterm-faint)] transition hover:bg-white/5 hover:text-[var(--oterm-danger)]"
          title="Clear all review comments"
          aria-label="Clear all review comments"
          @click="onClearAllComments"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 4h10M5.5 4V2.5h5V4M6 7v5M10 7v5M4 4l.8 9.5a1 1 0 001 .9h4.4a1 1 0 001-.9L12 4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>

    <!-- No-Agent Accessible Status Notice -->
    <div
      v-if="draft.comments.length && !agentName"
      class="text-[10px] text-[var(--oterm-faint)]"
      role="status"
    >
      No active CLI agent running in terminal; use Copy feedback or open an agent in terminal.
    </div>

    <!-- Active Comment Editor -->
    <div
      v-if="activeTargetFile"
      class="review-editor rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/40 p-2.5 flex flex-col gap-2"
      data-review-comment-editor
    >
      <!-- Target Coordinates Bar -->
      <div class="flex items-center justify-between gap-1.5 text-[11px]">
        <div class="flex items-center gap-1.5 min-w-0">
          <span
            class="rounded px-1.5 py-0.2 font-medium"
            :class="{
              'bg-green-500/15 text-green-400': activeTargetFile.staged,
              'bg-amber-500/15 text-amber-400': !activeTargetFile.staged && !activeTargetFile.untracked,
              'bg-blue-500/15 text-blue-400': activeTargetFile.untracked,
            }"
          >
            {{ fileDomain(activeTargetFile) }}
          </span>
          <span class="truncate font-mono text-[var(--oterm-text)]" :title="activeTargetFile.path">
            {{ activeTargetFile.path }}
          </span>
          <span
            v-if="draft.editor.range"
            class="rounded bg-white/10 px-1.5 py-0.2 font-mono text-[var(--oterm-muted)] shrink-0"
          >
            {{ rangeLabel(draft.editor.range) }}
          </span>
          <span
            v-else
            class="rounded bg-white/5 px-1.5 py-0.2 text-[var(--oterm-faint)] shrink-0"
          >
            File comment
          </span>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button
            v-if="draft.editor.range"
            type="button"
            class="rounded px-1 py-0.5 text-[10px] text-[var(--oterm-faint)] transition hover:bg-white/5 hover:text-[var(--oterm-text)]"
            title="Clear line selection to comment on entire file"
            @click="clearEditorRange"
          >
            Clear selection
          </button>
          <button
            v-if="selectedFile && !isSameFile(selectedFile, activeTargetFile)"
            type="button"
            class="rounded px-1 py-0.5 text-[10px] text-[var(--oterm-faint)] transition hover:bg-white/5 hover:text-[var(--oterm-text)]"
            title="Switch comment to current file"
            @click="onAddFileComment"
          >
            Switch to current file
          </button>
        </div>
      </div>

      <!-- Excerpt Preview -->
      <div
        v-if="draft.editor.range?.excerpt"
        class="rounded bg-black/20 px-2 py-1 font-mono text-[10px] text-[var(--oterm-muted)] max-h-16 overflow-y-auto whitespace-pre leading-relaxed border border-[var(--oterm-border)]/50"
      >{{ draft.editor.range.excerpt }}</div>

      <!-- Input Textarea -->
      <textarea
        v-model="draft.editor.body"
        data-review-comment-editor
        aria-label="Review comment"
        rows="2"
        class="oterm-scroll w-full resize-y rounded border border-[var(--oterm-border)] bg-[var(--oterm-bg)] px-2.5 py-1.5 text-xs text-[var(--oterm-text)] outline-none ring-[var(--oterm-accent)] placeholder:text-[var(--oterm-faint)] focus:ring-1"
        :placeholder="draft.editor.range ? 'Write comment for selected lines (Ctrl+Enter to save)…' : 'Write file comment (Ctrl+Enter to save)…'"
        :disabled="disabled"
        @input="persistDraft"
        @keydown.ctrl.enter="onSaveComment"
        @keydown.meta.enter="onSaveComment"
        @keydown.escape="onEditorEscape"
      />

      <!-- Action Buttons -->
      <div class="flex items-center justify-between gap-2 pt-0.5">
        <span class="text-[10px] text-[var(--oterm-faint)]">
          {{ draft.editor.id ? "Editing comment" : "Ctrl+Enter to save" }}
        </span>
        <div class="flex items-center gap-1.5">
          <button
            v-if="draft.editor.id"
            type="button"
            class="rounded border border-[var(--oterm-border)] px-2 py-1 text-[11px] text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)]"
            @click="onCancelEdit"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded bg-[var(--oterm-accent)] px-2.5 py-1 text-[11px] font-medium text-[var(--oterm-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!canSaveComment || disabled"
            @click="onSaveComment"
          >
            {{ draft.editor.id ? "Update comment" : "Add comment" }}
          </button>
        </div>
      </div>
    </div>

    <!-- Empty Selection State (when no file is active and no draft editor file) -->
    <div
      v-else-if="!draft.comments.length"
      class="rounded-md border border-[var(--oterm-border)]/40 p-3 text-center text-[var(--oterm-faint)]"
    >
      Select a file or diff lines above to add review comments.
    </div>

    <!-- Saved Comments List -->
    <div v-if="draft.comments.length" class="flex flex-col gap-1.5 pt-1">
      <div
        v-for="comment in draft.comments"
        :key="comment.id"
        class="group/comment rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/20 p-2 text-xs transition hover:border-[var(--oterm-border)]/80"
      >
        <div class="flex items-center justify-between gap-1 text-[10px] text-[var(--oterm-faint)] pb-1">
          <div class="flex items-center gap-1.5 min-w-0">
            <span
              class="rounded px-1 py-0.2 font-medium"
              :class="{
                'bg-green-500/15 text-green-400': comment.file.staged,
                'bg-amber-500/15 text-amber-400': !comment.file.staged && !comment.file.untracked,
                'bg-blue-500/15 text-blue-400': comment.file.untracked,
              }"
            >
              {{ fileDomain(comment.file) }}
            </span>
            <span class="truncate font-mono text-[var(--oterm-muted)]" :title="comment.file.path">
              {{ comment.file.path }}
            </span>
            <span v-if="comment.range" class="font-mono text-[var(--oterm-faint)]">
              · {{ rangeLabel(comment.range) }}
            </span>
          </div>
          <div class="flex items-center gap-1 shrink-0 opacity-80 group-hover/comment:opacity-100">
            <button
              type="button"
              class="rounded px-1.5 py-0.5 text-[10px] text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)] disabled:cursor-not-allowed disabled:opacity-40"
              :title="isEditDisabled(comment) ? 'Save or cancel pending comment before editing another' : 'Edit comment'"
              :disabled="isEditDisabled(comment)"
              :aria-disabled="isEditDisabled(comment)"
              @click="onEditComment(comment)"
            >
              Edit
            </button>
            <button
              type="button"
              class="rounded px-1.5 py-0.5 text-[10px] text-[var(--oterm-faint)] transition hover:bg-white/5 hover:text-[var(--oterm-danger)]"
              title="Delete comment"
              aria-label="Delete comment"
              @click="onDeleteComment(comment.id)"
            >
              Delete
            </button>
          </div>
        </div>

        <div
          v-if="comment.range?.excerpt"
          class="my-1 rounded bg-black/20 px-2 py-0.5 font-mono text-[10px] text-[var(--oterm-faint)] truncate"
          :title="comment.range.excerpt"
        >{{ comment.range.excerpt }}</div>

        <p class="whitespace-pre-wrap text-[var(--oterm-text)] leading-relaxed break-words pt-0.5">
          {{ comment.body }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.review-panel {
  background: var(--oterm-bg);
}
</style>
