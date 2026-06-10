<script setup lang="ts">
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  attachmentDisplayName,
  extractClipboardImagePaths,
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
}>();

const draftByPane = new Map<string, string>();

const draft = ref(draftByPane.get(props.paneId) ?? "");
const attachments = ref<string[]>([]);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const submitting = ref(false);
const dragActive = ref(false);

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
});

function resizeTextarea() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
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
    await nextTick();
    resizeTextarea();
  } finally {
    submitting.value = false;
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void submitDraft();
  }
}

async function onPaste(event: ClipboardEvent) {
  const paths = await extractClipboardImagePaths(event.clipboardData);
  if (paths.length === 0) return;
  event.preventDefault();
  addAttachmentPaths(paths);
}

async function focusComposer() {
  await nextTick();
  textareaRef.value?.focus();
}

onMounted(() => {
  resizeTextarea();
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
});

defineExpose({
  focusComposer,
});
</script>

<template>
  <div
    class="agent-composer shrink-0 border-t border-[var(--oterm-border)] bg-[var(--oterm-elevated)] px-4 py-3"
    @mousedown.stop
  >
    <div
      class="mx-auto flex w-full max-w-4xl flex-col gap-2 rounded-xl border bg-[var(--oterm-bg)] px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-colors"
      :class="dragActive ? 'border-[var(--oterm-accent)]' : 'border-[var(--oterm-border)]'"
      :style="agent && !dragActive ? { borderColor: `${agent.brandColor}33` } : undefined"
    >
      <div class="flex items-center gap-2 text-xs text-[var(--oterm-faint)]">
        <AgentFooterBadge v-if="agentId" :agent-id="agentId" />
        <span class="font-medium text-[var(--oterm-text)]">{{ composerTitle }}</span>
        <button
          type="button"
          class="ml-auto rounded px-2 py-0.5 text-[var(--oterm-faint)] transition-colors hover:bg-[var(--oterm-border)] hover:text-[var(--oterm-text)]"
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
        class="min-h-[2.25rem] w-full resize-none bg-transparent font-mono text-sm leading-relaxed text-[var(--oterm-text)] outline-none placeholder:text-[var(--oterm-faint)]"
        :placeholder="composerPlaceholder"
        :disabled="submitting"
        @input="resizeTextarea"
        @keydown="onKeydown"
        @paste="onPaste"
      />
      <div
        v-if="attachments.length > 0"
        class="flex flex-wrap gap-2"
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
      <div class="flex items-center justify-between gap-3 text-xs text-[var(--oterm-faint)]">
        <div class="flex min-w-0 items-center gap-2">
          <button
            type="button"
            class="shrink-0 rounded border border-[var(--oterm-border)] px-2.5 py-1 text-[var(--oterm-text)] transition-colors hover:bg-[var(--oterm-elevated)]"
            :disabled="submitting"
            title="Attach image or video"
            @click="pickAttachments"
          >
            Attach
          </button>
          <span class="hidden sm:inline">Paste or drop images</span>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <span class="hidden md:inline">Enter to send · Shift+Enter newline · Ctrl+V image · Esc close</span>
          <span class="md:hidden">Enter send · Esc close</span>
          <button
            type="button"
            class="rounded bg-[var(--oterm-accent)] px-3 py-1.5 text-xs font-medium text-[var(--oterm-bg)] transition-opacity disabled:opacity-40"
            :disabled="!canSubmit || submitting"
            @click="submitDraft"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
