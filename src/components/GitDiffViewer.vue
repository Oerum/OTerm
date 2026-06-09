<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  buildLinePatch,
  buildSideBySideRows,
  parseUnifiedDiff,
  type DiffDisplayLineKind,
  type DiffHunk,
  type SideBySideCell,
} from "../lib/parseUnifiedDiff";
import type { SelectedGitFile } from "../types/git";

const SIDE_BY_SIDE_MIN_WIDTH = 960;

const props = defineProps<{
  content: string;
  loading?: boolean;
  error?: string | null;
  selectedFile?: SelectedGitFile | null;
  busy?: boolean;
  hunkOperationKey?: string | null;
  activeHunkIndex?: number;
  feedback?: string | null;
  feedbackError?: boolean;
}>();

const emit = defineEmits<{
  "revert-hunk": [patch: string, opKey: string];
  "stage-hunk": [patch: string, opKey: string];
  "unstage-hunk": [patch: string, opKey: string];
  "update:activeHunkIndex": [index: number];
  "hunk-count": [count: number];
}>();

const hunkRefs = ref<Record<number, HTMLElement | null>>({});
const viewerRootRef = ref<HTMLElement | null>(null);
const sideBySide = ref(false);
let resizeObserver: ResizeObserver | null = null;

const parsed = computed(() => parseUnifiedDiff(props.content));
const hunks = computed(() => parsed.value.hunks);
const fileHeaders = computed(() => parsed.value.fileHeaders);
const sideBySideRows = computed(() =>
  hunks.value.map((hunk) => ({ hunk, rows: buildSideBySideRows(hunk) })),
);

const canHunkOps = computed(
  () => Boolean(props.selectedFile && !props.selectedFile.untracked && hunks.value.length > 0),
);

const showStageActions = computed(() => canHunkOps.value && !props.selectedFile?.staged);
const showUnstageActions = computed(() => canHunkOps.value && Boolean(props.selectedFile?.staged));

function lineOpKey(hunkIndex: number, lineIndex: number) {
  return `${hunkIndex}:${lineIndex}`;
}

function setHunkRef(index: number, el: Element | null) {
  hunkRefs.value[index] = el as HTMLElement | null;
}

function scrollToHunk(index: number) {
  hunkRefs.value[index]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function lineRowClass(kind: DiffDisplayLineKind) {
  if (kind === "add") return "diff-line diff-line--add";
  if (kind === "remove") return "diff-line diff-line--remove";
  return "diff-line diff-line--context";
}

function sideCellClass(cell: SideBySideCell) {
  if (cell.kind === "empty") return "diff-line diff-line--empty";
  return lineRowClass(cell.kind);
}

function updateSideBySideLayout(width: number) {
  sideBySide.value = width >= SIDE_BY_SIDE_MIN_WIDTH;
}

onMounted(() => {
  if (!viewerRootRef.value || typeof ResizeObserver === "undefined") return;
  updateSideBySideLayout(viewerRootRef.value.clientWidth);
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    updateSideBySideLayout(entry.contentRect.width);
  });
  resizeObserver.observe(viewerRootRef.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

function isLineBusy(hunkIndex: number, lineIndex: number) {
  return props.hunkOperationKey === lineOpKey(hunkIndex, lineIndex);
}

function lineActionsDisabled(hunkIndex: number, lineIndex: number) {
  return Boolean(props.busy) || isLineBusy(hunkIndex, lineIndex);
}

function patchForLine(hunk: DiffHunk, lineIndex: number) {
  return buildLinePatch(hunk, lineIndex) ?? hunk.patch;
}

function onRevertLine(hunk: DiffHunk, lineIndex: number) {
  if (!canHunkOps.value || lineActionsDisabled(hunk.index, lineIndex)) return;
  emit("revert-hunk", patchForLine(hunk, lineIndex), lineOpKey(hunk.index, lineIndex));
}

function onStageLine(hunk: DiffHunk, lineIndex: number) {
  if (!showStageActions.value || lineActionsDisabled(hunk.index, lineIndex)) return;
  emit("stage-hunk", patchForLine(hunk, lineIndex), lineOpKey(hunk.index, lineIndex));
}

function onUnstageLine(hunk: DiffHunk, lineIndex: number) {
  if (!showUnstageActions.value || lineActionsDisabled(hunk.index, lineIndex)) return;
  emit("unstage-hunk", patchForLine(hunk, lineIndex), lineOpKey(hunk.index, lineIndex));
}

function onSideCellAction(hunk: DiffHunk, cell: SideBySideCell) {
  if (cell.sourceLineIndex == null || cell.kind === "empty" || cell.kind === "context") return;
  if (cell.kind === "remove") onRevertLine(hunk, cell.sourceLineIndex);
  else if (showStageActions.value) onStageLine(hunk, cell.sourceLineIndex);
  else if (showUnstageActions.value) onUnstageLine(hunk, cell.sourceLineIndex);
}

function sideCellBusy(cell: SideBySideCell) {
  if (cell.sourceLineIndex == null) return false;
  return isLineBusy(cell.hunkIndex, cell.sourceLineIndex);
}

function sideCellDisabled(cell: SideBySideCell) {
  if (cell.sourceLineIndex == null) return true;
  return lineActionsDisabled(cell.hunkIndex, cell.sourceLineIndex);
}

function sideCellCanAct(cell: SideBySideCell) {
  return (
    cell.kind !== "empty" &&
    cell.kind !== "context" &&
    canHunkOps.value &&
    cell.sourceLineIndex != null
  );
}

watch(
  hunks,
  (next) => {
    emit("hunk-count", next.length);
    if (next.length === 0) {
      emit("update:activeHunkIndex", 0);
      return;
    }
    const active = props.activeHunkIndex ?? 0;
    if (active >= next.length) {
      emit("update:activeHunkIndex", next.length - 1);
    }
  },
  { immediate: true },
);

watch(
  () => props.activeHunkIndex,
  async (index) => {
    if (index == null || index < 0) return;
    await nextTick();
    scrollToHunk(index);
  },
);

watch(
  () => props.content,
  () => {
    emit("update:activeHunkIndex", 0);
  },
);
</script>

<template>
  <div ref="viewerRootRef" class="diff-viewer flex min-h-0 flex-1 flex-col">
    <div v-if="loading" class="px-3 py-4 text-sm text-[var(--oterm-faint)]">Loading diff…</div>
    <div v-else-if="error" class="px-3 py-4 text-sm text-[var(--diff-remove-text)]">{{ error }}</div>
    <div v-else-if="!content.trim()" class="px-3 py-4 text-sm text-[var(--oterm-faint)]">
      No diff to display
    </div>
    <div v-else class="oterm-scroll min-h-0 flex-1 overflow-auto">
      <p
        v-if="feedback"
        class="diff-feedback sticky top-0 z-10 border-b px-3 py-1.5 text-xs"
        :class="feedbackError ? 'diff-feedback--error' : 'diff-feedback--ok'"
      >
        {{ feedback }}
      </p>
      <div
        v-if="fileHeaders.length"
        class="border-b border-[var(--oterm-border)] px-3 py-1.5 text-[11px] text-[var(--oterm-faint)]"
        style="font-family: var(--oterm-font-mono)"
      >
        <p v-for="(line, index) in fileHeaders" :key="index" class="truncate">{{ line }}</p>
      </div>
      <div v-if="sideBySide" class="diff-body diff-body--split" style="font-family: var(--oterm-font-mono)">
        <section
          v-for="{ hunk, rows } in sideBySideRows"
          :key="hunk.index"
          :ref="(el) => setHunkRef(hunk.index, el as Element | null)"
          class="diff-hunk"
          :class="{ 'diff-hunk--active': activeHunkIndex === hunk.index }"
        >
          <div class="diff-hunk-header">{{ hunk.header }}</div>
          <div
            v-for="(row, rowIndex) in rows"
            :key="`${hunk.index}-${rowIndex}`"
            class="diff-split-row group/line"
          >
            <div class="diff-split-pane" :class="sideCellClass(row.left)">
              <div class="diff-gutter">
                <template v-if="sideCellCanAct(row.left)">
                  <div
                    class="diff-gutter-actions"
                    :class="{ 'diff-gutter-actions--visible': sideCellBusy(row.left) }"
                  >
                    <button
                      type="button"
                      class="diff-gutter-btn diff-gutter-btn--revert"
                      title="Discard change"
                      :disabled="sideCellDisabled(row.left)"
                      @click="onSideCellAction(hunk, row.left)"
                    >
                      <span v-if="sideCellBusy(row.left)" class="diff-gutter-spinner" />
                      <svg
                        v-else
                        width="11"
                        height="11"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          d="M3 8h7M6 5L3 8l3 3"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      v-if="showStageActions && row.left.kind === 'add'"
                      type="button"
                      class="diff-gutter-btn diff-gutter-btn--stage"
                      title="Stage change"
                      :disabled="sideCellDisabled(row.left)"
                      @click="onStageLine(hunk, row.left.sourceLineIndex!)"
                    >
                      +
                    </button>
                    <button
                      v-if="showUnstageActions && row.left.kind === 'add'"
                      type="button"
                      class="diff-gutter-btn diff-gutter-btn--unstage"
                      title="Unstage change"
                      :disabled="sideCellDisabled(row.left)"
                      @click="onUnstageLine(hunk, row.left.sourceLineIndex!)"
                    >
                      −
                    </button>
                  </div>
                </template>
              </div>
              <div class="diff-lnum">{{ row.left.lineNumber ?? "" }}</div>
              <div class="diff-code">
                <span v-if="row.left.kind === 'remove'" class="diff-prefix">−</span>
                <span v-else-if="row.left.kind === 'context'" class="diff-prefix">&nbsp;</span>
                <span v-else class="diff-prefix">&nbsp;</span>
                <span class="diff-text">{{ row.left.kind === "empty" ? " " : row.left.text || " " }}</span>
              </div>
            </div>
            <div class="diff-split-divider" aria-hidden="true" />
            <div class="diff-split-pane" :class="sideCellClass(row.right)">
              <div class="diff-gutter">
                <template v-if="sideCellCanAct(row.right)">
                  <div
                    class="diff-gutter-actions"
                    :class="{ 'diff-gutter-actions--visible': sideCellBusy(row.right) }"
                  >
                    <button
                      type="button"
                      class="diff-gutter-btn diff-gutter-btn--revert"
                      title="Discard change"
                      :disabled="sideCellDisabled(row.right)"
                      @click="onSideCellAction(hunk, row.right)"
                    >
                      <span v-if="sideCellBusy(row.right)" class="diff-gutter-spinner" />
                      <svg
                        v-else
                        width="11"
                        height="11"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          d="M3 8h7M6 5L3 8l3 3"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      v-if="showStageActions && row.right.kind === 'add'"
                      type="button"
                      class="diff-gutter-btn diff-gutter-btn--stage"
                      title="Stage change"
                      :disabled="sideCellDisabled(row.right)"
                      @click="onStageLine(hunk, row.right.sourceLineIndex!)"
                    >
                      +
                    </button>
                    <button
                      v-if="showUnstageActions && row.right.kind === 'add'"
                      type="button"
                      class="diff-gutter-btn diff-gutter-btn--unstage"
                      title="Unstage change"
                      :disabled="sideCellDisabled(row.right)"
                      @click="onUnstageLine(hunk, row.right.sourceLineIndex!)"
                    >
                      −
                    </button>
                  </div>
                </template>
              </div>
              <div class="diff-lnum">{{ row.right.lineNumber ?? "" }}</div>
              <div class="diff-code">
                <span v-if="row.right.kind === 'add'" class="diff-prefix">+</span>
                <span v-else-if="row.right.kind === 'context'" class="diff-prefix">&nbsp;</span>
                <span v-else class="diff-prefix">&nbsp;</span>
                <span class="diff-text">{{ row.right.kind === "empty" ? " " : row.right.text || " " }}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div v-else class="diff-body" style="font-family: var(--oterm-font-mono)">
        <section
          v-for="hunk in hunks"
          :key="hunk.index"
          :ref="(el) => setHunkRef(hunk.index, el as Element | null)"
          class="diff-hunk"
          :class="{ 'diff-hunk--active': activeHunkIndex === hunk.index }"
        >
          <div class="diff-hunk-header">{{ hunk.header }}</div>
          <div
            v-for="(line, lineIndex) in hunk.lines"
            :key="`${hunk.index}-${lineIndex}`"
            class="diff-row group/line"
            :class="lineRowClass(line.kind)"
          >
            <div class="diff-gutter">
              <template v-if="line.kind !== 'context' && canHunkOps">
                <div
                  class="diff-gutter-actions"
                  :class="{ 'diff-gutter-actions--visible': isLineBusy(hunk.index, lineIndex) }"
                >
                  <button
                    type="button"
                    class="diff-gutter-btn diff-gutter-btn--revert"
                    title="Discard change"
                    :disabled="lineActionsDisabled(hunk.index, lineIndex)"
                    @click="onRevertLine(hunk, lineIndex)"
                  >
                    <span
                      v-if="isLineBusy(hunk.index, lineIndex)"
                      class="diff-gutter-spinner"
                    />
                    <svg
                      v-else
                      width="11"
                      height="11"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        d="M3 8h7M6 5L3 8l3 3"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    v-if="showStageActions"
                    type="button"
                    class="diff-gutter-btn diff-gutter-btn--stage"
                    title="Stage change"
                    :disabled="lineActionsDisabled(hunk.index, lineIndex)"
                    @click="onStageLine(hunk, lineIndex)"
                  >
                    +
                  </button>
                  <button
                    v-if="showUnstageActions"
                    type="button"
                    class="diff-gutter-btn diff-gutter-btn--unstage"
                    title="Unstage change"
                    :disabled="lineActionsDisabled(hunk.index, lineIndex)"
                    @click="onUnstageLine(hunk, lineIndex)"
                  >
                    −
                  </button>
                </div>
              </template>
            </div>
            <div class="diff-lnum diff-lnum--old">{{ line.oldLine ?? "" }}</div>
            <div class="diff-lnum diff-lnum--new">{{ line.newLine ?? "" }}</div>
            <div class="diff-code">
              <span v-if="line.kind === 'add'" class="diff-prefix">+</span>
              <span v-else-if="line.kind === 'remove'" class="diff-prefix">−</span>
              <span v-else class="diff-prefix">&nbsp;</span>
              <span class="diff-text">{{ line.text || " " }}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diff-viewer {
  background: var(--diff-editor-bg);
}

.diff-feedback {
  font-family: var(--oterm-font-ui);
  background: color-mix(in srgb, var(--oterm-bg) 92%, transparent);
  backdrop-filter: blur(6px);
}

.diff-feedback--ok {
  color: var(--diff-insert-text);
  border-color: var(--oterm-border);
}

.diff-feedback--error {
  color: var(--diff-remove-text);
  border-color: color-mix(in srgb, var(--diff-remove-text) 35%, var(--oterm-border));
}

.diff-body {
  font-size: 12px;
  line-height: 20px;
}

.diff-hunk--active {
  outline: 1px solid color-mix(in srgb, var(--oterm-accent) 35%, transparent);
  outline-offset: -1px;
}

.diff-hunk-header {
  padding: 4px 12px 4px 52px;
  color: var(--oterm-faint);
  background: var(--diff-hunk-header-bg);
  border-top: 1px solid var(--oterm-border);
  border-bottom: 1px solid var(--oterm-border);
  user-select: none;
}

.diff-row {
  display: grid;
  grid-template-columns: 40px 44px 44px minmax(0, 1fr);
  min-height: 20px;
}

.diff-line--add {
  background: var(--diff-insert-bg);
  border-left: 3px solid var(--diff-insert-border);
}

.diff-line--remove {
  background: var(--diff-remove-bg);
  border-left: 3px solid var(--diff-remove-border);
}

.diff-line--context {
  border-left: 3px solid transparent;
}

.diff-line--empty {
  border-left: 3px solid transparent;
  background: color-mix(in srgb, var(--diff-editor-bg) 92%, rgba(255, 255, 255, 0.04));
}

.diff-body--split .diff-hunk-header {
  padding-left: 12px;
}

.diff-split-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 1px minmax(0, 1fr);
  min-height: 20px;
}

.diff-split-pane {
  display: grid;
  grid-template-columns: 40px 44px minmax(0, 1fr);
  min-width: 0;
}

.diff-split-divider {
  background: var(--oterm-border);
}

.diff-gutter {
  display: flex;
  align-items: stretch;
  justify-content: center;
  background: var(--diff-gutter-bg);
  border-right: 1px solid var(--oterm-border);
}

.diff-gutter-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 0 2px;
  opacity: 0;
  transition: opacity 100ms ease;
}

.group\/line:hover .diff-gutter-actions,
.diff-gutter-actions--visible {
  opacity: 1;
}

.diff-gutter-btn {
  display: flex;
  height: 18px;
  width: 18px;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  font-size: 13px;
  line-height: 1;
  color: var(--oterm-faint);
  transition: background 100ms ease, color 100ms ease;
}

.diff-gutter-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}

.diff-gutter-btn--revert:hover:not(:disabled) {
  color: var(--diff-remove-text);
}

.diff-gutter-btn--stage:hover:not(:disabled) {
  color: var(--diff-insert-text);
}

.diff-gutter-btn--unstage:hover:not(:disabled) {
  color: var(--oterm-text);
}

.diff-gutter-btn:disabled {
  opacity: 0.45;
}

.diff-gutter-spinner {
  display: inline-block;
  height: 10px;
  width: 10px;
  border-radius: 999px;
  border: 1.5px solid currentColor;
  border-right-color: transparent;
  animation: diff-spin 0.7s linear infinite;
}

@keyframes diff-spin {
  to {
    transform: rotate(360deg);
  }
}

.diff-lnum {
  padding: 0 8px;
  text-align: right;
  color: var(--diff-lnum);
  user-select: none;
  border-right: 1px solid var(--oterm-border);
}

.diff-code {
  display: flex;
  min-width: 0;
  padding-right: 12px;
  white-space: pre;
  overflow-x: auto;
}

.diff-line--add .diff-code {
  color: var(--diff-insert-text);
}

.diff-line--remove .diff-code {
  color: var(--diff-remove-text);
}

.diff-line--context .diff-code {
  color: var(--oterm-text);
}

.diff-prefix {
  flex: none;
  width: 1ch;
  opacity: 0.55;
  user-select: none;
}

.diff-text {
  min-width: 0;
}
</style>
