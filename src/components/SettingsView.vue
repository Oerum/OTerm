<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ApplicationSettingsPage from "./settings/ApplicationSettingsPage.vue";
import SftpTransferSettingsPage from "./settings/SftpTransferSettingsPage.vue";
import TerminalAutocompleteSettingsPage from "./settings/TerminalAutocompleteSettingsPage.vue";
import TerminalAppearanceSettingsPage from "./settings/TerminalAppearanceSettingsPage.vue";
import KeyMappingSettingsPage from "./settings/KeyMappingSettingsPage.vue";
import {
  SETTINGS_PALETTE_SECTIONS,
  type SettingsSectionId,
} from "../lib/commandPaletteItems";

const props = defineProps<{
  section?: SettingsSectionId | null;
}>();

const emit = defineEmits<{
  close: [];
  "update:section": [value: null];
}>();

const sections = SETTINGS_PALETTE_SECTIONS;
const activeSection = ref<SettingsSectionId>("application");

watch(
  () => props.section,
  (next) => {
    if (!next) return;
    activeSection.value = next;
    emit("update:section", null);
  },
  { immediate: true },
);

const activeMeta = computed(
  () => sections.find((section) => section.id === activeSection.value) ?? sections[0],
);
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col bg-[var(--oterm-bg)] text-[var(--oterm-text)]">
    <header
      class="flex shrink-0 items-center gap-3 border-b border-[var(--oterm-border)] px-4 py-2.5"
    >
      <h2 class="text-sm font-medium">Settings</h2>
      <span class="truncate text-xs text-[var(--oterm-muted)]">{{ activeMeta.description }}</span>
      <div class="flex-1" />
      <button
        type="button"
        class="rounded-md border border-[var(--oterm-border)] px-2.5 py-1 text-xs text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)]"
        @click="emit('close')"
      >
        Close
      </button>
    </header>

    <div class="flex min-h-0 flex-1">
      <aside
        class="flex w-52 shrink-0 flex-col border-r border-[var(--oterm-border)] bg-[var(--oterm-sidebar)]"
      >
        <nav class="oterm-scroll flex-1 overflow-y-auto p-2" aria-label="Settings sections">
          <button
            v-for="section in sections"
            :key="section.id"
            type="button"
            class="mb-0.5 w-full rounded-md px-2.5 py-2 text-left transition"
            :class="
              section.id === activeSection
                ? 'bg-[var(--oterm-accent-dim)] text-[var(--oterm-text)] ring-1 ring-[var(--oterm-accent)]/25'
                : 'text-[var(--oterm-muted)] hover:bg-white/5 hover:text-[var(--oterm-text)]'
            "
            @click="activeSection = section.id"
          >
            <span class="block text-xs font-medium">{{ section.label }}</span>
            <span class="mt-0.5 block text-[10px] leading-snug text-[var(--oterm-faint)]">
              {{ section.description }}
            </span>
          </button>
        </nav>
      </aside>

      <div class="oterm-scroll min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div class="mx-auto max-w-2xl px-6 py-6">
          <ApplicationSettingsPage v-if="activeSection === 'application'" />
          <TerminalAppearanceSettingsPage v-else-if="activeSection === 'terminal-appearance'" />
          <TerminalAutocompleteSettingsPage v-else-if="activeSection === 'terminal-autocomplete'" />
          <SftpTransferSettingsPage v-else-if="activeSection === 'sftp-transfers'" />
          <KeyMappingSettingsPage v-else-if="activeSection === 'key-mapping'" />
        </div>
      </div>
    </div>
  </div>
</template>
