<script setup lang="ts">
import { computed, ref } from "vue";
import AiProviderFields from "../AiProviderFields.vue";
import NumberStepper from "../NumberStepper.vue";
import { useTerminalAutocompleteSettings } from "../../lib/terminalAutocompleteSettings";
import {
  DEFAULT_TERMINAL_AUTOCOMPLETE_SYSTEM_PROMPT,
  isTerminalAutocompleteConfigured,
  type TerminalAutocompleteSettings,
} from "../../types/terminalAutocomplete";

const { settings, save } = useTerminalAutocompleteSettings();

const draft = ref<TerminalAutocompleteSettings>({ ...settings.value });
const saveError = ref<string | null>(null);
const saving = ref(false);
const saved = ref(false);
let savedTimer: number | undefined;

function snapshot(value: TerminalAutocompleteSettings): TerminalAutocompleteSettings {
  return {
    enabled: value.enabled,
    provider: value.provider,
    endpoint: value.endpoint.trim(),
    model: value.model.trim(),
    apiKey: value.apiKey.trim(),
    commandContextCount: value.commandContextCount,
    responseContextCount: value.responseContextCount,
    systemPrompt: value.systemPrompt.trim() || DEFAULT_TERMINAL_AUTOCOMPLETE_SYSTEM_PROMPT,
    enableReasoning: value.enableReasoning,
    enableToolCalls: value.enableToolCalls,
  };
}

function resetSystemPrompt() {
  draft.value.systemPrompt = DEFAULT_TERMINAL_AUTOCOMPLETE_SYSTEM_PROMPT;
}

const dirty = computed(
  () => JSON.stringify(snapshot(draft.value)) !== JSON.stringify(snapshot(settings.value)),
);

function validate(): string | null {
  const endpoint = draft.value.endpoint.trim();
  const model = draft.value.model.trim();
  if (draft.value.enabled && !endpoint) {
    return "Endpoint is required when autocomplete is enabled.";
  }
  if (draft.value.enabled && !model) {
    return "Model is required when autocomplete is enabled.";
  }
  if (
    draft.value.enabled &&
    draft.value.provider === "openai-compatible" &&
    !draft.value.apiKey.trim()
  ) {
    return "API key is required for OpenAI-compatible providers.";
  }
  return null;
}

async function onSave() {
  saveError.value = null;
  const error = validate();
  if (error) {
    saveError.value = error;
    return;
  }

  saving.value = true;
  try {
    const next = snapshot(draft.value);
    await save(next);
    draft.value = { ...next };
    saved.value = true;
    window.clearTimeout(savedTimer);
    savedTimer = window.setTimeout(() => {
      saved.value = false;
    }, 2500);
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : "Failed to save settings.";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h3 class="text-base font-medium text-[var(--warp-text)]">Terminal AI autocomplete</h3>
      <p class="mt-1.5 text-sm leading-relaxed text-[var(--warp-faint)]">
        Suggests the next shell command from recent terminal history and your current input.
        Disabled while agent CLIs (Claude, Codex, Gemini, etc.) are active.
      </p>
    </div>

    <label
      class="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--warp-border)] bg-[var(--warp-panel)] px-3 py-2.5 transition hover:border-[var(--warp-border-strong)]"
    >
      <input
        v-model="draft.enabled"
        type="checkbox"
        class="h-4 w-4 rounded border-[var(--warp-border-strong)] bg-[var(--warp-bg)] accent-[var(--warp-accent)]"
      />
      <span class="text-sm text-[var(--warp-text)]">Enable terminal autocomplete</span>
    </label>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="space-y-3">
        <span class="block text-xs font-medium text-[var(--warp-muted)]">Commands in context</span>
        <NumberStepper v-model="draft.commandContextCount" :min="1" :max="50" />
        <p class="pt-0.5 text-[10px] leading-relaxed text-[var(--warp-faint)]">
          Recent commands sent to the model.
        </p>
      </div>
      <div class="space-y-3">
        <span class="block text-xs font-medium text-[var(--warp-muted)]">Responses in context</span>
        <NumberStepper v-model="draft.responseContextCount" :min="1" :max="50" />
        <p class="pt-0.5 text-[10px] leading-relaxed text-[var(--warp-faint)]">
          Output size budget per command.
        </p>
      </div>
    </div>

    <AiProviderFields
      v-model:provider="draft.provider"
      v-model:endpoint="draft.endpoint"
      v-model:model="draft.model"
      v-model:api-key="draft.apiKey"
    />

    <div class="space-y-3">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-[var(--warp-muted)]">System prompt</span>
        <button
          type="button"
          class="text-[10px] text-[var(--warp-faint)] transition hover:text-[var(--warp-muted)]"
          @click="resetSystemPrompt"
        >
          Reset
        </button>
      </div>
      <textarea
        v-model="draft.systemPrompt"
        rows="6"
        class="w-full resize-y rounded-md border border-[var(--warp-border)] bg-[var(--warp-bg)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--warp-text)] outline-none ring-[var(--warp-accent)] focus:ring-1"
      />
      <p class="text-[10px] leading-relaxed text-[var(--warp-faint)]">
        Instructions sent as the system message for every autocomplete request.
      </p>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <label
        class="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--warp-border)] bg-[var(--warp-panel)] px-3 py-2.5 transition hover:border-[var(--warp-border-strong)]"
      >
        <input
          v-model="draft.enableReasoning"
          type="checkbox"
          class="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--warp-border-strong)] bg-[var(--warp-bg)] accent-[var(--warp-accent)]"
        />
        <span class="space-y-0.5">
          <span class="block text-sm text-[var(--warp-text)]">Enable reasoning</span>
          <span class="block text-[10px] leading-relaxed text-[var(--warp-faint)]">
            Use model reasoning output when the main reply is empty (slower on thinking models).
          </span>
        </span>
      </label>
      <label
        class="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--warp-border)] bg-[var(--warp-panel)] px-3 py-2.5 transition hover:border-[var(--warp-border-strong)]"
      >
        <input
          v-model="draft.enableToolCalls"
          type="checkbox"
          class="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--warp-border-strong)] bg-[var(--warp-bg)] accent-[var(--warp-accent)]"
        />
        <span class="space-y-0.5">
          <span class="block text-sm text-[var(--warp-text)]">Enable tool calls</span>
          <span class="block text-[10px] leading-relaxed text-[var(--warp-faint)]">
            Allow the model to invoke tools. Off sends <code class="text-[var(--warp-muted)]">tool_choice: none</code>.
          </span>
        </span>
      </label>
    </div>

    <p
      v-if="draft.enabled && !isTerminalAutocompleteConfigured(draft)"
      class="text-xs text-[var(--warp-faint)]"
    >
      Choose a provider and model to use autocomplete.
    </p>

    <div
      class="sticky bottom-0 -mx-1 flex items-center justify-between gap-3 border-t border-[var(--warp-border)] bg-[var(--warp-bg)]/95 px-1 pt-4 backdrop-blur-sm"
    >
      <p v-if="saveError" class="text-xs text-[var(--warp-danger)]">{{ saveError }}</p>
      <p v-else-if="saved && !dirty" class="text-xs text-[var(--warp-accent)]">Settings saved.</p>
      <p v-else-if="dirty" class="text-xs text-[var(--warp-faint)]">Unsaved changes</p>
      <span v-else class="flex-1" />

      <button
        type="button"
        class="ml-auto rounded-md bg-[var(--warp-accent)] px-4 py-2 text-xs font-medium text-[var(--warp-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="saving"
        @click="onSave"
      >
        {{ saving ? "Saving…" : "Save" }}
      </button>
    </div>
  </div>
</template>
