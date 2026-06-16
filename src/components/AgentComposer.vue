<script setup lang="ts">
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  cancelDictationRecording,
  downloadDictationModel,
  getDictationStatus,
  listenDictationLivePartial,
  listenDictationModelDownloadProgress,
  startDictationRecording,
  stopDictationAndTranscribe,
  type DictationModelDownloadProgressEvent,
} from "../lib/dictationApi";
import {
  applyLiveDictationToDraft,
} from "../lib/dictationDraft";
import { isDictationShortcut } from "../lib/appKeyboardShortcuts";
import {
  attachmentDisplayName,
  readClipboardImagePaths,
  formatAgentComposerMessage,
  isMediaAttachmentPath,
  pickMediaAttachmentPaths,
} from "../lib/agentComposerAttachments";
import {
  submitAgentComposerText,
  submitTerminalComposerText,
} from "../lib/agentComposerSubmit";
import { getCliAgentDefinition, type CliAgentId } from "../lib/terminalAgentMode";
import { writeTerminal } from "../lib/terminalApi";
import AgentFooterBadge from "./AgentFooterBadge.vue";

const props = defineProps<{
  paneId: string;
  agentId?: CliAgentId | null;
  sessionId: string;
}>();

const emit = defineEmits<{
  submitted: [text: string];
  close: [];
  layoutChange: [];
}>();

const TEXTAREA_MAX_HEIGHT_PX = 160;

const draftByPane = new Map<string, string>();

const draft = ref(draftByPane.get(props.paneId) ?? "");
const attachments = ref<string[]>([]);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const submitting = ref(false);
const dragActive = ref(false);
const isFocused = ref(false);

type DictationUiState = "idle" | "downloading" | "recording" | "transcribing";

const dictationState = ref<DictationUiState>("idle");
const dictationError = ref<string | null>(null);
const downloadProgress = ref<DictationModelDownloadProgressEvent | null>(null);
const recordingStartedAt = ref<number | null>(null);
const recordingElapsedSec = ref(0);

let unlistenDownloadProgress: (() => void) | undefined;
let unlistenLivePartial: (() => void) | undefined;
let recordingTimer: ReturnType<typeof setInterval> | undefined;
let dictationBaseDraft: string | null = null;

const dictationBusy = computed(
  () => dictationState.value === "downloading" || dictationState.value === "transcribing",
);

const composerDisabled = computed(() => submitting.value || dictationBusy.value);

const textareaDisabled = computed(
  () => submitting.value || dictationBusy.value || dictationState.value === "recording",
);

const downloadProgressPercent = computed(() => {
  const progress = downloadProgress.value;
  if (!progress?.totalBytes) return null;
  return Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100));
});

const recordingTimerLabel = computed(() => {
  const minutes = Math.floor(recordingElapsedSec.value / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (recordingElapsedSec.value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
});

const agent = computed(() =>
  props.agentId ? getCliAgentDefinition(props.agentId) : null,
);

const composerTitle = computed(() => agent.value?.displayName ?? "Terminal");
const composerPlaceholder = computed(() =>
  agent.value ? "Message the agent…" : "Send to terminal…",
);

const canSubmit = computed(
  () =>
    Boolean(draft.value.trim()) ||
    attachments.value.some((path) => path.trim().length > 0),
);

let unlistenDragDrop: (() => void) | undefined;

watch(
  () => props.paneId,
  (paneId) => {
    draft.value = draftByPane.get(paneId) ?? "";
    attachments.value = [];
  },
);

watch(draft, (value) => {
  draftByPane.set(props.paneId, value);
  void nextTick(resizeTextarea);
});

function resizeTextarea() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  const nextHeight = Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT_PX);
  el.style.height = `${nextHeight}px`;
  el.style.overflowY = el.scrollHeight > TEXTAREA_MAX_HEIGHT_PX ? "auto" : "hidden";
  emit("layoutChange");
}

function addAttachmentPaths(paths: string[]) {
  const incoming = paths.filter(isMediaAttachmentPath);
  if (incoming.length === 0) return;
  const merged = new Set(attachments.value);
  for (const path of incoming) {
    merged.add(path);
  }
  attachments.value = [...merged];
}

function clearRecordingTimer() {
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = undefined;
  }
  recordingStartedAt.value = null;
  recordingElapsedSec.value = 0;
}

function startRecordingTimer() {
  clearRecordingTimer();
  recordingStartedAt.value = Date.now();
  recordingElapsedSec.value = 0;
  recordingTimer = setInterval(() => {
    if (recordingStartedAt.value == null) return;
    recordingElapsedSec.value = Math.floor((Date.now() - recordingStartedAt.value) / 1000);
  }, 250);
}

async function ensureDictationModel(): Promise<boolean> {
  const status = await getDictationStatus();
  if (status.modelInstalled) return true;

  dictationState.value = "downloading";
  downloadProgress.value = null;
  unlistenDownloadProgress?.();
  unlistenDownloadProgress = await listenDictationModelDownloadProgress((event) => {
    downloadProgress.value = event;
  });

  try {
    await downloadDictationModel();
    return true;
  } finally {
    unlistenDownloadProgress?.();
    unlistenDownloadProgress = undefined;
  }
}

function clearLiveDictation(revertDraft = false) {
  unlistenLivePartial?.();
  unlistenLivePartial = undefined;
  if (revertDraft && dictationBaseDraft !== null) {
    draft.value = dictationBaseDraft;
  }
  dictationBaseDraft = null;
}

async function startLiveDictationListener() {
  unlistenLivePartial?.();
  unlistenLivePartial = await listenDictationLivePartial((event) => {
    if (dictationState.value !== "recording" || dictationBaseDraft === null) return;
    draft.value = applyLiveDictationToDraft(dictationBaseDraft, event.text);
  });
}

async function toggleDictation() {
  if (submitting.value || dictationBusy.value) return;

  dictationError.value = null;

  if (dictationState.value === "recording") {
    dictationState.value = "transcribing";
    clearRecordingTimer();
    const base = dictationBaseDraft ?? draft.value;
    try {
      const result = await stopDictationAndTranscribe();
      clearLiveDictation(false);
      if (result.text.trim()) {
        draft.value = applyLiveDictationToDraft(base, result.text);
      } else {
        draft.value = base;
      }
    } catch (error) {
      clearLiveDictation(false);
      draft.value = base;
      dictationError.value =
        error instanceof Error ? error.message : "Dictation failed";
    } finally {
      dictationState.value = "idle";
      downloadProgress.value = null;
    }
    return;
  }

  if (dictationState.value !== "idle") return;

  try {
    const ready = await ensureDictationModel();
    if (!ready) {
      dictationError.value = "Whisper model download failed";
      dictationState.value = "idle";
      return;
    }

    await startDictationRecording();
    dictationBaseDraft = draft.value;
    await startLiveDictationListener();
    dictationState.value = "recording";
    startRecordingTimer();
  } catch (error) {
    clearLiveDictation(true);
    dictationError.value =
      error instanceof Error ? error.message : "Could not start recording";
    dictationState.value = "idle";
    clearRecordingTimer();
  }
}

async function cancelDictation() {
  dictationError.value = null;
  if (dictationState.value === "recording") {
    try {
      await cancelDictationRecording();
    } catch (error) {
      dictationError.value =
        error instanceof Error ? error.message : "Could not cancel recording";
    }
  }
  clearLiveDictation(true);
  clearRecordingTimer();
  dictationState.value = "idle";
  downloadProgress.value = null;
}

function removeAttachment(path: string) {
  attachments.value = attachments.value.filter((entry) => entry !== path);
}

async function pickAttachments() {
  const paths = await pickMediaAttachmentPaths();
  addAttachmentPaths(paths);
}

async function submitDraft() {
  const text = formatAgentComposerMessage(draft.value, attachments.value);
  if (!text || submitting.value) return;

  submitting.value = true;
  try {
    if (props.agentId) {
      await submitAgentComposerText(props.sessionId, props.agentId, text, writeTerminal);
    } else {
      await submitTerminalComposerText(props.sessionId, text, writeTerminal);
    }
    draft.value = "";
    draftByPane.set(props.paneId, "");
    attachments.value = [];
    emit("submitted", text);
  } finally {
    submitting.value = false;
  }
}

function onKeydown(event: KeyboardEvent) {
  if (isDictationShortcut(event)) {
    event.preventDefault();
    void toggleDictation();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void submitDraft();
    return;
  }
}

async function onPaste(event: ClipboardEvent) {
  const paths = await readClipboardImagePaths({
    clipboardData: event.clipboardData,
    destination: "composer",
  });
  if (paths.length === 0) return;
  event.preventDefault();
  addAttachmentPaths(paths);
}

async function focusComposer() {
  await nextTick();
  textareaRef.value?.focus();
}

onMounted(() => {
  void nextTick(resizeTextarea);
  void getCurrentWebview()
    .onDragDropEvent((event) => {
      if (event.payload.type === "over") {
        dragActive.value = true;
        return;
      }
      if (event.payload.type === "leave") {
        dragActive.value = false;
        return;
      }
      if (event.payload.type === "drop") {
        dragActive.value = false;
        addAttachmentPaths(event.payload.paths);
      }
    })
    .then((unlisten) => {
      unlistenDragDrop = unlisten;
    })
    .catch(() => {
      // Drag-drop is optional outside the Tauri webview.
    });
});

onBeforeUnmount(() => {
  unlistenDragDrop?.();
  unlistenDownloadProgress?.();
  clearLiveDictation(true);
  clearRecordingTimer();
  if (dictationState.value === "recording") {
    void cancelDictationRecording().catch(() => undefined);
  }
});

function insertText(text: string) {
  const prefix = draft.value.length > 0 && !draft.value.endsWith(" ") ? " " : "";
  draft.value += prefix + text;
}

defineExpose({
  focusComposer,
  toggleDictation,
  addAttachmentPaths,
  insertText,
});
</script>

<template>
  <div
    class="agent-composer shrink-0 border-t border-[var(--oterm-border)] bg-[var(--oterm-elevated)] px-4 py-3"
    @mousedown.stop
  >
    <div
      class="mx-auto flex w-full max-w-4xl flex-col gap-2 overflow-hidden rounded-2xl border bg-[var(--oterm-bg)] px-3 py-2.5 transition-all duration-200"
      :class="[
        dragActive 
          ? 'border-[var(--oterm-accent)] ring-1 ring-[var(--oterm-accent)]/20 shadow-[0_0_15px_rgba(0,229,186,0.15)]' 
          : isFocused
            ? 'border-[var(--oterm-accent)]/45 ring-1 ring-[var(--oterm-accent)]/15 shadow-[0_6px_28px_rgba(0,0,0,0.35),0_0_12px_rgba(0,0,0,0.08)]'
            : 'border-[var(--oterm-border-strong)] shadow-[0_4px_20px_rgba(0,0,0,0.2)]'
      ]"
      :style="agent && !dragActive && !isFocused ? { borderColor: `${agent.brandColor}33` } : undefined"
    >
      <div class="flex shrink-0 items-center gap-2 text-xs text-[var(--oterm-faint)]">
        <AgentFooterBadge v-if="agentId" :agent-id="agentId" />
        <span class="font-medium text-[var(--oterm-text)]">{{ composerTitle }}</span>
        <button
          type="button"
          class="ml-auto rounded px-2 py-0.5 text-[var(--oterm-faint)] btn-premium"
          title="Close composer (Escape)"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
      <textarea
        ref="textareaRef"
        v-model="draft"
        rows="1"
        class="min-h-[2.25rem] max-h-40 w-full shrink-0 resize-none overflow-y-auto oterm-scroll bg-transparent font-mono text-sm leading-relaxed text-[var(--oterm-text)] outline-none placeholder:text-[var(--oterm-faint)]"
        :placeholder="composerPlaceholder"
        :disabled="textareaDisabled"
        @focus="isFocused = true"
        @blur="isFocused = false"
        @keydown="onKeydown"
        @paste="onPaste"
      />
      <div
        v-if="attachments.length > 0"
        class="flex shrink-0 flex-wrap gap-2"
      >
        <div
          v-for="path in attachments"
          :key="path"
          class="flex max-w-full items-center gap-1.5 rounded-full border border-[var(--oterm-border)] bg-[var(--oterm-elevated)] px-2.5 py-1 text-xs text-[var(--oterm-text)]"
        >
          <span class="truncate" :title="path">{{ attachmentDisplayName(path) }}</span>
          <button
            type="button"
            class="shrink-0 text-[var(--oterm-faint)] transition-colors hover:text-[var(--oterm-text)]"
            :title="`Remove ${attachmentDisplayName(path)}`"
            @click="removeAttachment(path)"
          >
            ×
          </button>
        </div>
      </div>
      <div class="flex shrink-0 flex-col gap-1.5">
        <div class="flex items-center justify-between gap-3 text-xs">
          <div class="flex min-w-0 items-center gap-2">
            <button
              type="button"
              class="shrink-0 rounded-md border border-[var(--oterm-border)] px-2.5 py-1 text-[var(--oterm-text)] btn-premium disabled:opacity-40"
              :disabled="composerDisabled"
              title="Attach image or video"
              @click="pickAttachments"
            >
              Attach
            </button>
            <button
              v-if="dictationState === 'idle'"
              type="button"
              class="shrink-0 rounded-md border border-[var(--oterm-border)] px-2 py-1 text-[var(--oterm-text)] btn-premium disabled:opacity-40"
              :disabled="composerDisabled"
              title="Dictate with local Whisper (Ctrl+F)"
              aria-label="Dictate"
              @click="toggleDictation"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 1.5a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 5 0V4A2.5 2.5 0 0 0 8 1.5Z" />
                <path d="M4 7.5a4 4 0 0 0 8 0H10.5a2.5 2.5 0 0 1-5 0H4Z" />
                <path d="M7.25 12.75V14h1.5v-1.25H7.25Z" />
                <path d="M5.5 14.25c0 .69.56 1.25 1.25 1.25h2.5c.69 0 1.25-.56 1.25-1.25H5.5Z" />
              </svg>
            </button>
            <div
              v-else-if="dictationState === 'downloading'"
              class="flex min-w-[10rem] items-center gap-2 text-[var(--oterm-faint)]"
            >
              <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--oterm-border)]">
                <div
                  class="h-full bg-[var(--oterm-accent)] transition-all"
                  :style="{ width: `${downloadProgressPercent ?? 8}%` }"
                />
              </div>
              <span class="shrink-0">Downloading model…</span>
            </div>
            <div
              v-else-if="dictationState === 'recording'"
              class="inline-flex items-center gap-2"
            >
              <span class="relative flex h-2.5 w-2.5">
                <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
              <span class="font-mono text-[var(--oterm-text)]">{{ recordingTimerLabel }}</span>
              <button
                type="button"
                class="rounded-md border border-red-500/40 px-2 py-0.5 text-red-300 btn-premium hover:bg-red-500/10"
                title="Stop and transcribe (Ctrl+F)"
                @click="toggleDictation"
              >
                Stop
              </button>
              <button
                type="button"
                class="rounded-md px-2 py-0.5 text-[var(--oterm-faint)] btn-premium hover:text-[var(--oterm-text)]"
                title="Cancel recording"
                @click="cancelDictation"
              >
                Cancel
              </button>
            </div>
            <div
              v-else-if="dictationState === 'transcribing'"
              class="inline-flex items-center gap-2 text-[var(--oterm-text)]"
            >
              <svg
                class="animate-spin"
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                aria-hidden="true"
              >
                <circle cx="8" cy="8" r="6" stroke-opacity="0.25" stroke-width="2" />
                <path d="M14 8a6 6 0 0 0-6-6" stroke-width="2" stroke-linecap="round" />
              </svg>
              Transcribing…
            </div>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-md bg-[var(--oterm-accent)] px-3 py-1.5 text-xs font-medium text-[var(--oterm-bg)] btn-premium disabled:opacity-40"
            :disabled="!canSubmit || composerDisabled"
            @click="submitDraft"
          >
            Send
          </button>
        </div>
        <div class="flex items-center justify-between gap-3 text-[10px] leading-none text-[var(--oterm-faint)]">
          <span class="hidden min-w-0 truncate sm:inline">Paste or drop images</span>
          <span class="hidden shrink-0 text-right lg:inline">
            Enter send · Shift+Enter newline · Ctrl+F dictate · Ctrl+V image · Esc close
          </span>
          <span class="hidden shrink-0 text-right md:inline lg:hidden">
            Enter send · Ctrl+F dictate · Esc close
          </span>
          <span class="shrink-0 md:hidden">Enter send · Esc close</span>
        </div>
      </div>
      <p
        v-if="dictationError"
        class="shrink-0 text-xs text-red-400"
      >
        {{ dictationError }}
      </p>
    </div>
  </div>
</template>
