<script setup lang="ts">
import { ref, watch } from "vue";
import { listLmModels, testLmConnection } from "../lib/lmStudioApi";
import { useLmSettings } from "../lib/lmSettings";
import { DEFAULT_COMMIT_MESSAGE_PROMPT, type LmSettings } from "../types/lm";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { settings, update } = useLmSettings();

const draft = ref<LmSettings>(cloneSettings(settings.value));
const models = ref<string[]>([]);
const modelsLoading = ref(false);
const modelsError = ref<string | null>(null);
const testStatus = ref<string | null>(null);
const testLoading = ref(false);
const saveError = ref<string | null>(null);

function cloneSettings(value: LmSettings): LmSettings {
  return {
    endpoint: value.endpoint,
    model: value.model,
    prompts: { ...value.prompts },
  };
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    draft.value = cloneSettings(settings.value);
    models.value = [];
    modelsError.value = null;
    testStatus.value = null;
    saveError.value = null;
  },
);

async function refreshModels() {
  modelsLoading.value = true;
  modelsError.value = null;
  try {
    const listed = await listLmModels(draft.value.endpoint);
    models.value = listed.map((entry) => entry.id);
    if (!draft.value.model && models.value.length > 0) {
      draft.value.model = models.value[0] ?? "";
    }
  } catch (err) {
    models.value = [];
    modelsError.value = err instanceof Error ? err.message : String(err);
  } finally {
    modelsLoading.value = false;
  }
}

async function onTestConnection() {
  testLoading.value = true;
  testStatus.value = null;
  try {
    testStatus.value = await testLmConnection(draft.value.endpoint);
  } catch (err) {
    testStatus.value = err instanceof Error ? err.message : String(err);
  } finally {
    testLoading.value = false;
  }
}

async function onSave() {
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

  update({
    endpoint,
    model,
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
    class="absolute inset-0 z-40 flex items-start justify-center bg-black/55 pt-[8vh] backdrop-blur-[2px]"
    @click.self="emit('close')"
  >
    <div
      role="dialog"
      aria-labelledby="lm-settings-title"
      class="flex max-h-[84vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--warp-border-strong)] bg-[var(--warp-elevated)] shadow-2xl"
      @mousedown.stop
    >
      <div class="flex items-center justify-between border-b border-[var(--warp-border)] px-4 py-3">
        <h2 id="lm-settings-title" class="text-sm font-medium text-[var(--warp-text)]">LM Studio</h2>
        <button
          type="button"
          class="text-xs text-[var(--warp-faint)] transition hover:text-[var(--warp-muted)]"
          @click="emit('close')"
        >
          Esc
        </button>
      </div>

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <label class="block space-y-1.5">
          <span class="text-xs text-[var(--warp-muted)]">Endpoint</span>
          <input
            v-model="draft.endpoint"
            type="url"
            class="w-full rounded-md border border-[var(--warp-border)] bg-[var(--warp-bg)] px-2.5 py-2 text-sm text-[var(--warp-text)] outline-none ring-[var(--warp-accent)] focus:ring-1"
            placeholder="http://localhost:1234/v1"
          />
        </label>

        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs text-[var(--warp-muted)]">Model</span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-md border border-[var(--warp-border)] px-2 py-1 text-[10px] text-[var(--warp-muted)] transition hover:bg-white/5 hover:text-[var(--warp-text)] disabled:opacity-40"
                :disabled="modelsLoading"
                @click="refreshModels"
              >
                {{ modelsLoading ? "Loading…" : "Refresh models" }}
              </button>
              <button
                type="button"
                class="rounded-md border border-[var(--warp-border)] px-2 py-1 text-[10px] text-[var(--warp-muted)] transition hover:bg-white/5 hover:text-[var(--warp-text)] disabled:opacity-40"
                :disabled="testLoading"
                @click="onTestConnection"
              >
                {{ testLoading ? "Testing…" : "Test connection" }}
              </button>
            </div>
          </div>
          <select
            v-if="models.length > 0"
            v-model="draft.model"
            class="w-full rounded-md border border-[var(--warp-border)] bg-[var(--warp-bg)] px-2.5 py-2 text-sm text-[var(--warp-text)] outline-none ring-[var(--warp-accent)] focus:ring-1"
          >
            <option v-for="id in models" :key="id" :value="id">{{ id }}</option>
          </select>
          <input
            v-model="draft.model"
            type="text"
            class="w-full rounded-md border border-[var(--warp-border)] bg-[var(--warp-bg)] px-2.5 py-2 text-sm text-[var(--warp-text)] outline-none ring-[var(--warp-accent)] focus:ring-1"
            placeholder="Model id (type manually or refresh list)"
          />
          <p v-if="modelsError" class="text-xs text-[var(--warp-danger)]">{{ modelsError }}</p>
          <p v-else-if="testStatus" class="text-xs text-[var(--warp-muted)]">{{ testStatus }}</p>
        </div>

        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs text-[var(--warp-muted)]">Commit message prompt</span>
            <button
              type="button"
              class="text-[10px] text-[var(--warp-faint)] transition hover:text-[var(--warp-muted)]"
              @click="onResetCommitPrompt"
            >
              Reset to default
            </button>
          </div>
          <textarea
            v-model="draft.prompts.commitMessage"
            rows="12"
            class="w-full resize-y rounded-md border border-[var(--warp-border)] bg-[var(--warp-bg)] px-2.5 py-2 font-mono text-xs leading-relaxed text-[var(--warp-text)] outline-none ring-[var(--warp-accent)] focus:ring-1"
          />
        </div>

        <p v-if="saveError" class="text-xs text-[var(--warp-danger)]">{{ saveError }}</p>
      </div>

      <div class="flex justify-end gap-2 border-t border-[var(--warp-border)] px-4 py-3">
        <button
          type="button"
          class="rounded-md border border-[var(--warp-border)] px-3 py-1.5 text-xs text-[var(--warp-muted)] transition hover:bg-white/5 hover:text-[var(--warp-text)]"
          @click="emit('close')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-md bg-[var(--warp-accent)] px-3 py-1.5 text-xs font-medium text-[var(--warp-bg)] transition hover:opacity-90"
          @click="onSave"
        >
          Save
        </button>
      </div>
    </div>
  </div>
</template>
