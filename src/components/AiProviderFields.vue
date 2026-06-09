<script setup lang="ts">
import { computed, ref } from "vue";
import {
  detectGithubCopilotToken,
  listCommitAiModels,
  testCommitAiConnection,
} from "../lib/commitAiApi";
import { COMMIT_AI_PROVIDER_PRESETS, type CommitAiProvider } from "../types/commitAi";

const provider = defineModel<CommitAiProvider>("provider", { required: true });
const endpoint = defineModel<string>("endpoint", { required: true });
const model = defineModel<string>("model", { required: true });
const apiKey = defineModel<string>("apiKey", { required: true });

const models = ref<string[]>([]);
const modelsLoading = ref(false);
const modelsError = ref<string | null>(null);
const testStatus = ref<string | null>(null);
const testLoading = ref(false);
const copilotTokenHint = ref<string | null>(null);

const providerOptions = computed(() =>
  (Object.keys(COMMIT_AI_PROVIDER_PRESETS) as CommitAiProvider[]).map((id) => ({
    id,
    ...COMMIT_AI_PROVIDER_PRESETS[id],
  })),
);

const showApiKey = computed(
  () => provider.value === "openai-compatible" || provider.value === "github-copilot",
);

const apiKeyLabel = computed(() =>
  provider.value === "github-copilot" ? "OAuth token" : "API key",
);

function onProviderChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value as CommitAiProvider;
  const preset = COMMIT_AI_PROVIDER_PRESETS[value];
  provider.value = value;
  endpoint.value = preset.endpoint;
  models.value = [];
  modelsError.value = null;
  testStatus.value = null;
}

async function refreshModels() {
  modelsLoading.value = true;
  modelsError.value = null;
  try {
    const listed = await listCommitAiModels(endpoint.value, provider.value, apiKey.value);
    models.value = listed.map((entry) => entry.id);
    if (!model.value && models.value.length > 0) {
      model.value = models.value[0] ?? "";
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
      endpoint.value,
      provider.value,
      apiKey.value,
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
      copilotTokenHint.value =
        "No token found. Sign in via GitHub Copilot in VS Code or JetBrains.";
      return;
    }
    apiKey.value = token;
    copilotTokenHint.value = "Loaded token from local GitHub Copilot config.";
  } catch (err) {
    copilotTokenHint.value = err instanceof Error ? err.message : String(err);
  }
}

defineExpose({ refreshModels, onLoadCopilotToken });
</script>

<template>
  <div class="space-y-3">
    <label class="block space-y-1">
      <span class="text-xs text-[var(--oterm-muted)]">Provider</span>
      <select
        :value="provider"
        class="w-full rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)] px-2.5 py-2 text-sm text-[var(--oterm-text)] outline-none ring-[var(--oterm-accent)] focus:ring-1"
        @change="onProviderChange"
      >
        <option v-for="option in providerOptions" :key="option.id" :value="option.id">
          {{ option.label }}
        </option>
      </select>
      <p class="text-[10px] leading-relaxed text-[var(--oterm-faint)]">
        {{ COMMIT_AI_PROVIDER_PRESETS[provider].description }}
      </p>
    </label>

    <label class="block space-y-1">
      <span class="text-xs text-[var(--oterm-muted)]">Endpoint</span>
      <input
        v-model="endpoint"
        type="url"
        class="w-full rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)] px-2.5 py-2 text-sm text-[var(--oterm-text)] outline-none ring-[var(--oterm-accent)] focus:ring-1"
      />
    </label>

    <div v-if="showApiKey" class="space-y-1">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs text-[var(--oterm-muted)]">{{ apiKeyLabel }}</span>
        <button
          v-if="provider === 'github-copilot'"
          type="button"
          class="text-[10px] text-[var(--oterm-faint)] transition hover:text-[var(--oterm-muted)]"
          @click="onLoadCopilotToken"
        >
          Load from disk
        </button>
      </div>
      <input
        v-model="apiKey"
        type="password"
        autocomplete="off"
        class="w-full rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)] px-2.5 py-2 text-sm text-[var(--oterm-text)] outline-none ring-[var(--oterm-accent)] focus:ring-1"
        :placeholder="
          provider === 'github-copilot' ? 'ghu_… (optional if found on disk)' : 'sk-…'
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
        v-model="model"
        class="w-full rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)] px-2.5 py-2 text-sm text-[var(--oterm-text)] outline-none ring-[var(--oterm-accent)] focus:ring-1"
      >
        <option v-for="id in models" :key="id" :value="id">{{ id }}</option>
      </select>
      <input
        v-model="model"
        type="text"
        class="w-full rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)] px-2.5 py-2 text-sm text-[var(--oterm-text)] outline-none ring-[var(--oterm-accent)] focus:ring-1"
        placeholder="Model id"
      />
      <p v-if="modelsError" class="text-xs text-[var(--oterm-danger)]">{{ modelsError }}</p>
      <p v-else-if="testStatus" class="text-xs text-[var(--oterm-muted)]">{{ testStatus }}</p>
    </div>
  </div>
</template>
