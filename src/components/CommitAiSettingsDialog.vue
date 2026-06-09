<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  detectGithubCopilotToken,
  listCommitAiModels,
  testCommitAiConnection,
} from "../lib/commitAiApi";
import { useCommitAiSettings } from "../lib/commitAiSettings";
import {
  COMMIT_AI_PROVIDER_PRESETS,
  DEFAULT_COMMIT_MESSAGE_PROMPT,
  type CommitAiProvider,
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
const models = ref<string[]>([]);
const modelsLoading = ref(false);
const modelsError = ref<string | null>(null);
const testStatus = ref<string | null>(null);
const testLoading = ref(false);
const saveError = ref<string | null>(null);
const copilotTokenHint = ref<string | null>(null);

const providerOptions = computed(() =>
  (Object.keys(COMMIT_AI_PROVIDER_PRESETS) as CommitAiProvider[]).map((id) => ({
    id,
    ...COMMIT_AI_PROVIDER_PRESETS[id],
  })),
);

const showApiKey = computed(
  () => draft.value.provider === "openai-compatible" || draft.value.provider === "github-copilot",
);

const apiKeyLabel = computed(() =>
  draft.value.provider === "github-copilot" ? "OAuth token" : "API key",
);

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
  async (isOpen) => {
    if (!isOpen) return;
    draft.value = cloneSettings(settings.value);
    models.value = [];
    modelsError.value = null;
    testStatus.value = null;
    saveError.value = null;
    copilotTokenHint.value = null;
    if (draft.value.provider === "github-copilot" && !draft.value.apiKey.trim()) {
      try {
        const token = await detectGithubCopilotToken();
        if (token) {
          copilotTokenHint.value = "Found a GitHub Copilot token on this machine.";
        }
      } catch {
        // ignore
      }
    }
  },
);

function onProviderChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value as CommitAiProvider;
  const preset = COMMIT_AI_PROVIDER_PRESETS[value];
  draft.value.provider = value;
  draft.value.endpoint = preset.endpoint;
  models.value = [];
  modelsError.value = null;
  testStatus.value = null;
}

async function refreshModels() {
  modelsLoading.value = true;
  modelsError.value = null;
  try {
    const listed = await listCommitAiModels(
      draft.value.endpoint,
      draft.value.provider,
      draft.value.apiKey,
    );
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
    testStatus.value = await testCommitAiConnection(
      draft.value.endpoint,
      draft.value.provider,
      draft.value.apiKey,
    );
  } catch (err) {
    testStatus.value = err instanceof Error ? err.message : String(err);
  } finally {
    testLoading.value = false;
  }
}

async function onLoadCopilotToken() {
  copilotTokenHint.value = null;
  try {
    const token = await detectGithubCopilotToken();
    if (!token) {
      copilotTokenHint.value = "No token found. Sign in via GitHub Copilot in VS Code or JetBrains.";
      return;
    }
    draft.value.apiKey = token;
    copilotTokenHint.value = "Loaded token from local GitHub Copilot config.";
  } catch (err) {
    copilotTokenHint.value = err instanceof Error ? err.message : String(err);
  }
}

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
          Esc
        </button>
      </div>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <label class="block space-y-1">
          <span class="text-xs text-[var(--oterm-muted)]">Provider</span>
          <select
            :value="draft.provider"
            class="w-full rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)] px-2.5 py-2 text-sm text-[var(--oterm-text)] outline-none ring-[var(--oterm-accent)] focus:ring-1"
            @change="onProviderChange"
          >
            <option v-for="option in providerOptions" :key="option.id" :value="option.id">
              {{ option.label }}
            </option>
          </select>
          <p class="text-[10px] leading-relaxed text-[var(--oterm-faint)]">
            {{ COMMIT_AI_PROVIDER_PRESETS[draft.provider].description }}
          </p>
        </label>

        <label class="block space-y-1">
          <span class="text-xs text-[var(--oterm-muted)]">Endpoint</span>
          <input
            v-model="draft.endpoint"
            type="url"
            class="w-full rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)] px-2.5 py-2 text-sm text-[var(--oterm-text)] outline-none ring-[var(--oterm-accent)] focus:ring-1"
          />
        </label>

        <div v-if="showApiKey" class="space-y-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs text-[var(--oterm-muted)]">{{ apiKeyLabel }}</span>
            <button
              v-if="draft.provider === 'github-copilot'"
              type="button"
              class="text-[10px] text-[var(--oterm-faint)] transition hover:text-[var(--oterm-muted)]"
              @click="onLoadCopilotToken"
            >
              Load from disk
            </button>
          </div>
          <input
            v-model="draft.apiKey"
            type="password"
            autocomplete="off"
            class="w-full rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)] px-2.5 py-2 text-sm text-[var(--oterm-text)] outline-none ring-[var(--oterm-accent)] focus:ring-1"
            :placeholder="
              draft.provider === 'github-copilot'
                ? 'ghu_… (optional if found on disk)'
                : 'sk-…'
            "
          />
          <p v-if="copilotTokenHint" class="text-[10px] text-[var(--oterm-muted)]">
            {{ copilotTokenHint }}
          </p>
        </div>

        <div class="space-y-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs text-[var(--oterm-muted)]">Model</span>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                class="rounded-md border border-[var(--oterm-border)] px-2 py-1 text-[10px] text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)] disabled:opacity-40"
                :disabled="modelsLoading"
                @click="refreshModels"
              >
                {{ modelsLoading ? "Loading…" : "Refresh" }}
              </button>
              <button
                type="button"
                class="rounded-md border border-[var(--oterm-border)] px-2 py-1 text-[10px] text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)] disabled:opacity-40"
                :disabled="testLoading"
                @click="onTestConnection"
              >
                {{ testLoading ? "Testing…" : "Test" }}
              </button>
            </div>
          </div>
          <select
            v-if="models.length > 0"
            v-model="draft.model"
            class="w-full rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)] px-2.5 py-2 text-sm text-[var(--oterm-text)] outline-none ring-[var(--oterm-accent)] focus:ring-1"
          >
            <option v-for="id in models" :key="id" :value="id">{{ id }}</option>
          </select>
          <input
            v-model="draft.model"
            type="text"
            class="w-full rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)] px-2.5 py-2 text-sm text-[var(--oterm-text)] outline-none ring-[var(--oterm-accent)] focus:ring-1"
            placeholder="Model id"
          />
          <p v-if="modelsError" class="text-xs text-[var(--oterm-danger)]">{{ modelsError }}</p>
          <p v-else-if="testStatus" class="text-xs text-[var(--oterm-muted)]">{{ testStatus }}</p>
        </div>

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
