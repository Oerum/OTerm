<script setup lang="ts">
import { ref, watch } from "vue";
import AiProviderFields from "./AiProviderFields.vue";
import { useCommitAiSettings } from "../lib/commitAiSettings";
import {
  DEFAULT_COMMIT_MESSAGE_PROMPT,
  type CommitAiSettings,
} from "../types/commitAi";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { settings, update } = useCommitAiSettings();

const draft = ref<CommitAiSettings>(cloneSettings(settings.value));
const saveError = ref<string | null>(null);

function cloneSettings(value: CommitAiSettings): CommitAiSettings {
  return {
    provider: value.provider,
    endpoint: value.endpoint,
    model: value.model,
    apiKey: value.apiKey,
    prompts: { ...value.prompts },
  };
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    draft.value = cloneSettings(settings.value);
    saveError.value = null;
  },
);

function onSave() {
  saveError.value = null;
  const endpoint = draft.value.endpoint.trim();
  const model = draft.value.model.trim();
  if (!endpoint) {
    saveError.value = "Endpoint is required.";
    return;
  }
  if (!model) {
    saveError.value = "Model is required.";
    return;
  }
  if (draft.value.provider === "openai-compatible" && !draft.value.apiKey.trim()) {
    saveError.value = "API key is required for OpenAI-compatible providers.";
    return;
  }

  update({
    provider: draft.value.provider,
    endpoint,
    model,
    apiKey: draft.value.apiKey.trim(),
    prompts: { ...draft.value.prompts },
  });
  emit("close");
}

function onResetCommitPrompt() {
  draft.value.prompts.commitMessage = DEFAULT_COMMIT_MESSAGE_PROMPT;
}
</script>

<template>
  <div
    v-if="open"
    class="absolute inset-0 z-40 flex items-start justify-center bg-black/55 pt-4 backdrop-blur-[2px]"
    @click.self="emit('close')"
  >
    <div
      role="dialog"
      aria-labelledby="commit-ai-settings-title"
      class="flex max-h-[90%] w-[calc(100%-1.5rem)] max-w-md flex-col overflow-hidden rounded-xl border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] shadow-2xl"
      @mousedown.stop
    >
      <div class="flex items-center justify-between border-b border-[var(--oterm-border)] px-3 py-2.5">
        <h2 id="commit-ai-settings-title" class="text-sm font-medium text-[var(--oterm-text)]">
          Commit message AI
        </h2>
        <button
          type="button"
          class="text-xs text-[var(--oterm-faint)] transition hover:text-[var(--oterm-muted)]"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <AiProviderFields
          v-model:provider="draft.provider"
          v-model:endpoint="draft.endpoint"
          v-model:model="draft.model"
          v-model:apiKey="draft.apiKey"
        />

        <div class="space-y-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs text-[var(--oterm-muted)]">Commit prompt</span>
            <button
              type="button"
              class="text-[10px] text-[var(--oterm-faint)] transition hover:text-[var(--oterm-muted)]"
              @click="onResetCommitPrompt"
            >
              Reset
            </button>
          </div>
          <textarea
            v-model="draft.prompts.commitMessage"
            rows="8"
            class="w-full resize-y rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)] px-2.5 py-2 font-mono text-[10px] leading-relaxed text-[var(--oterm-text)] outline-none ring-[var(--oterm-accent)] focus:ring-1"
          />
        </div>

        <p v-if="saveError" class="text-xs text-[var(--oterm-danger)]">{{ saveError }}</p>
      </div>

      <div class="flex justify-end gap-2 border-t border-[var(--oterm-border)] px-3 py-2.5">
        <button
          type="button"
          class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)]"
          @click="emit('close')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-md bg-[var(--oterm-accent)] px-3 py-1.5 text-xs font-medium text-[var(--oterm-bg)] transition hover:opacity-90"
          @click="onSave"
        >
          Save
        </button>
      </div>
    </div>
  </div>
</template>
