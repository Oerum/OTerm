<script setup lang="ts">
import { computed, ref } from "vue";
import TerminalAutocompleteSettingsPage from "./settings/TerminalAutocompleteSettingsPage.vue";

const emit = defineEmits<{
  close: [];
}>();

type SettingsSectionId = "terminal-autocomplete";

const sections: { id: SettingsSectionId; label: string; description: string }[] = [
  {
    id: "terminal-autocomplete",
    label: "Terminal autocomplete",
    description: "AI command suggestions in the terminal",
  },
];

const activeSection = ref<SettingsSectionId>("terminal-autocomplete");

const activeMeta = computed(
  () => sections.find((section) => section.id === activeSection.value) ?? sections[0],
);
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col bg-[var(--warp-bg)] text-[var(--warp-text)]">
    <header
      class="flex shrink-0 items-center gap-3 border-b border-[var(--warp-border)] px-4 py-2.5"
    >
      <h2 class="text-sm font-medium">Settings</h2>
      <span class="truncate text-xs text-[var(--warp-muted)]">{{ activeMeta.description }}</span>
      <div class="flex-1" />
      <button
        type="button"
        class="rounded-md border border-[var(--warp-border)] px-2.5 py-1 text-xs text-[var(--warp-muted)] transition hover:bg-white/5 hover:text-[var(--warp-text)]"
        @click="emit('close')"
      >
        Close
      </button>
    </header>

    <div class="flex min-h-0 flex-1">
      <aside
        class="flex w-52 shrink-0 flex-col border-r border-[var(--warp-border)] bg-[var(--warp-sidebar)]"
      >
        <nav class="warp-scroll flex-1 overflow-y-auto p-2" aria-label="Settings sections">
          <button
            v-for="section in sections"
            :key="section.id"
            type="button"
            class="mb-0.5 w-full rounded-md px-2.5 py-2 text-left transition"
            :class="
              section.id === activeSection
                ? 'bg-[var(--warp-accent-dim)] text-[var(--warp-text)] ring-1 ring-[var(--warp-accent)]/25'
                : 'text-[var(--warp-muted)] hover:bg-white/5 hover:text-[var(--warp-text)]'
            "
            @click="activeSection = section.id"
          >
            <span class="block text-xs font-medium">{{ section.label }}</span>
            <span class="mt-0.5 block text-[10px] leading-snug text-[var(--warp-faint)]">
              {{ section.description }}
            </span>
          </button>
        </nav>
      </aside>

      <div class="warp-scroll min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div class="mx-auto max-w-2xl px-6 py-6">
          <TerminalAutocompleteSettingsPage v-if="activeSection === 'terminal-autocomplete'" />
        </div>
      </div>
    </div>
  </div>
</template>
