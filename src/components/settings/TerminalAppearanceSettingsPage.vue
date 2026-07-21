<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "../../lib/fsTransferApi";
import { pushAppToast } from "../../lib/appToast";
import {
  isThemeAppChromeEnabled,
  isThemeColorInput,
  setThemeAppChromeEnabled,
  useTerminalAppearanceSettings,
} from "../../lib/terminalAppearanceSettings";
import { BUILTIN_TERMINAL_THEMES } from "../../lib/terminalThemes";
import type { TerminalTheme } from "../../types/terminalTheme";

const {
  state,
  activeTheme,
  allThemes,
  setActiveThemeId,
  upsertCustomTheme,
  removeCustomTheme,
  duplicateTheme,
  resetToDefaults,
  exportTheme,
  importTheme,
} = useTerminalAppearanceSettings();

const draft = ref<TerminalTheme>(structuredClone(activeTheme.value));
const saveError = ref<string | null>(null);
const themeAppChrome = ref(isThemeAppChromeEnabled());

async function onThemeAppChromeChange(event: Event) {
  const enabled = (event.target as HTMLInputElement).checked;
  themeAppChrome.value = enabled;
  await setThemeAppChromeEnabled(enabled);
}

watch(
  () => state.value.activeThemeId,
  () => {
    draft.value = structuredClone(activeTheme.value);
  },
);

watch(
  activeTheme,
  (theme) => {
    draft.value = structuredClone(theme);
  },
  { immediate: true },
);

const isBuiltin = computed(() => BUILTIN_TERMINAL_THEMES.some((item) => item.id === draft.value.id));

const colorFields = [
  { key: "foreground", label: "Foreground", section: "xterm" as const },
  { key: "background", label: "Background", section: "xterm" as const },
  { key: "cursor", label: "Cursor", section: "xterm" as const },
  { key: "green", label: "Green", section: "xterm" as const },
  { key: "blue", label: "Blue", section: "xterm" as const },
  { key: "yellow", label: "Yellow", section: "xterm" as const },
  { key: "cyan", label: "Cyan", section: "xterm" as const },
  { key: "magenta", label: "Magenta", section: "xterm" as const },
  { key: "separator", label: "Block separator", section: "blocks" as const },
  { key: "meta", label: "Block metadata", section: "blocks" as const },
  { key: "command", label: "Command text", section: "blocks" as const, blockKey: "command" as const },
  { key: "failureBackground", label: "Failure background", section: "blocks" as const, blockKey: "failureBackground" as const },
  { key: "failureRail", label: "Failure rail", section: "blocks" as const, blockKey: "failureRail" as const },
  { key: "failureText", label: "Failure text", section: "blocks" as const, blockKey: "failureText" as const },
  { key: "token-command", label: "Token: command", section: "tokens" as const, tokenKey: "command" as const },
  { key: "subcommand", label: "Token: subcommand", section: "tokens" as const, tokenKey: "subcommand" as const },
  { key: "option", label: "Token: option", section: "tokens" as const, tokenKey: "option" as const },
  { key: "argument", label: "Token: argument", section: "tokens" as const, tokenKey: "argument" as const },
  { key: "variable", label: "Token: variable", section: "tokens" as const, tokenKey: "variable" as const },
];

function patchColor(field: (typeof colorFields)[number], value: string) {
  if (!isThemeColorInput(value)) return;
  if (field.section === "xterm") {
    draft.value.xterm = { ...draft.value.xterm, [field.key]: value };
  } else if (field.section === "blocks" && field.blockKey) {
    draft.value.blocks = { ...draft.value.blocks, [field.blockKey]: value };
  } else if (field.tokenKey) {
    draft.value.tokens = { ...draft.value.tokens, [field.tokenKey]: value };
  }
}

function readColor(field: (typeof colorFields)[number]): string {
  if (field.section === "xterm") {
    return String(draft.value.xterm[field.key as keyof typeof draft.value.xterm] ?? "");
  }
  if (field.section === "blocks" && field.blockKey) {
    return String(draft.value.blocks[field.blockKey] ?? "");
  }
  return String(draft.value.tokens[field.tokenKey!] ?? "");
}

function applyDraft() {
  saveError.value = null;
  if (isBuiltin.value) {
    setActiveThemeId(draft.value.id);
    pushAppToast("Preset applied", "success");
    return;
  }
  upsertCustomTheme(structuredClone(draft.value));
  setActiveThemeId(draft.value.id);
  pushAppToast("Theme saved", "success");
}

function saveAsCustom() {
  const id = `custom-${Date.now()}`;
  const next = structuredClone(draft.value);
  next.id = id;
  next.label = `${draft.value.label} copy`;
  draft.value = next;
  upsertCustomTheme(next);
  setActiveThemeId(id);
  pushAppToast("Saved as custom theme", "success");
}

async function exportCurrentTheme() {
  const path = await save({
    filters: [{ name: "JSON", extensions: ["json"] }],
    defaultPath: `${draft.value.id}.json`,
  });
  if (!path) return;
  const payload = JSON.stringify(exportTheme(draft.value.id), null, 2);
  await writeFile(path, new TextEncoder().encode(payload));
  pushAppToast("Theme exported", "success");
}

async function importThemeFile() {
  const path = await open({
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path || Array.isArray(path)) return;
  const data = await readFile(path);
  const text = new TextDecoder().decode(data);
  const parsed = JSON.parse(text) as unknown;
  const theme = importTheme(parsed);
  if (!theme) {
    saveError.value = "Invalid theme file.";
    return;
  }
  draft.value = structuredClone(theme);
  setActiveThemeId(theme.id);
  saveError.value = null;
  pushAppToast("Theme imported", "success");
}

function onDuplicatePreset() {
  const id = `custom-${Date.now()}`;
  duplicateTheme(draft.value.id, id, `${draft.value.label} copy`);
  draft.value = structuredClone(activeTheme.value);
}

function onResetDefaults() {
  resetToDefaults();
  draft.value = structuredClone(activeTheme.value);
  pushAppToast("Terminal appearance reset", "success");
}

function onRemoveCustom() {
  if (isBuiltin.value) return;
  removeCustomTheme(draft.value.id);
  draft.value = structuredClone(activeTheme.value);
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h3 class="text-base font-medium text-[var(--oterm-text)]">Terminal appearance</h3>
      <p class="mt-1.5 text-sm leading-relaxed text-[var(--oterm-faint)]">
        Customize terminal colors, command blocks, and syntax token colors. Changes apply to local
        terminals immediately. SSH hosts can still override with their own theme.
      </p>
    </div>

    <label class="flex items-center gap-2 text-sm text-[var(--oterm-muted)]">
      <input
        type="checkbox"
        class="rounded border-[var(--oterm-border)]"
        :checked="themeAppChrome"
        @change="onThemeAppChromeChange"
      />
      Theme app chrome
    </label>

    <div class="grid gap-4 sm:grid-cols-[220px_1fr]">
      <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
        Active theme
        <select
          :value="state.activeThemeId"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
          @change="setActiveThemeId(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="theme in allThemes" :key="theme.id" :value="theme.id">
            {{ theme.label }}
          </option>
        </select>
      </label>

      <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
        Theme label
        <input
          v-model="draft.label"
          :disabled="isBuiltin"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm disabled:opacity-60"
        />
      </label>
    </div>

    <div
      class="rounded-lg border border-[var(--oterm-border)] p-4"
      :style="{ backgroundColor: draft.xterm.background === 'transparent' ? '#000' : draft.xterm.background }"
    >
      <div class="mb-2 text-[11px] text-[var(--term-block-meta)]">~/Desktop/oterm  (0.041s)</div>
      <div class="font-mono text-sm">
        <span :style="{ color: draft.tokens.command, fontWeight: 600 }">git</span>
        <span :style="{ color: draft.tokens.subcommand, fontWeight: 600 }"> status</span>
      </div>
      <div class="mt-2 font-mono text-sm text-[var(--oterm-text)] opacity-80">
        On branch main
      </div>
      <div
        class="mt-3 rounded border-l-[3px] px-3 py-2 font-mono text-sm"
        :style="{
          borderColor: draft.blocks.failureRail,
          backgroundColor: draft.blocks.failureBackground,
          color: draft.blocks.failureText,
        }"
      >
        <div class="text-[11px] opacity-80">C:\Users\Filip  (0.107s)  exit 1</div>
        <div class="mt-1 font-semibold text-white">f</div>
        <div class="mt-1">Command not recognized.</div>
      </div>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <label
        v-for="field in colorFields"
        :key="`${field.section}-${field.key}`"
        class="grid gap-1 text-xs text-[var(--oterm-muted)]"
      >
        {{ field.label }}
        <input
          :value="readColor(field)"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 font-mono text-sm"
          @input="patchColor(field, ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>

    <p v-if="saveError" class="text-sm text-[var(--oterm-danger)]">{{ saveError }}</p>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-md bg-[var(--oterm-accent)] px-3 py-1.5 text-sm font-medium text-black"
        @click="applyDraft"
      >
        Apply theme
      </button>
      <button
        type="button"
        class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-sm"
        @click="saveAsCustom"
      >
        Save copy
      </button>
      <button
        type="button"
        class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-sm"
        @click="onDuplicatePreset"
      >
        Duplicate
      </button>
      <button
        type="button"
        class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-sm"
        @click="exportCurrentTheme"
      >
        Export JSON
      </button>
      <button
        type="button"
        class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-sm"
        @click="importThemeFile"
      >
        Import JSON
      </button>
      <button
        v-if="!isBuiltin"
        type="button"
        class="rounded-md border border-[var(--oterm-danger)]/40 px-3 py-1.5 text-sm text-[var(--oterm-danger)]"
        @click="onRemoveCustom"
      >
        Delete custom theme
      </button>
      <button
        type="button"
        class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-sm text-[var(--oterm-muted)]"
        @click="onResetDefaults"
      >
        Reset defaults
      </button>
    </div>
  </div>
</template>
