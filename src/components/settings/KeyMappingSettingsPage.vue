<script setup lang="ts">
import { ref, computed } from "vue";
import {
  ALL_KEYBIND_ACTIONS,
  type KeybindAction,
  type Keybind,
  getKeybind,
  setKeybind,
  formatKeybind,
  parseKeyboardEventToKeybind,
} from "../../lib/keybindSettings";
import { pushAppToast } from "../../lib/appToast";

const actionLabels: Record<KeybindAction, string> = {
  "terminal-new": "New Terminal (Grouped)",
  "terminal-new-ungrouped": "New Terminal (Ungrouped)",
  "terminal-reopen": "Reopen Closed Terminal",
  "reload-window": "Search / Commands",
  dictation: "Dictation",
  "tab-cycle": "Cycle Tabs",
  "terminal-set-default": "Set Default Shell (Menu)",
  "file-save": "Save File",
  "focus-branch-filter": "Focus Branch Filter",
  "navigate-parent-commit": "Navigate to Parent Commit",
  "navigate-child-commit": "Navigate to Child Commit",
  refresh: "Refresh Local/Remote SFTP",
  "delete-item": "Delete Item (SFTP)",
  "composer-toggle": "Toggle Agent Composer (Composer)",
};

const groups = [
  {
    name: "General",
    actions: ["reload-window", "dictation", "tab-cycle"] as KeybindAction[],
  },
  {
    name: "Terminal",
    actions: [
      "terminal-new",
      "terminal-new-ungrouped",
      "terminal-reopen",
      "terminal-set-default",
      "composer-toggle",
    ] as KeybindAction[],
  },
  {
    name: "Git",
    actions: [
      "file-save",
      "focus-branch-filter",
      "navigate-parent-commit",
      "navigate-child-commit",
    ] as KeybindAction[],
  },
  {
    name: "SFTP / Remote",
    actions: ["refresh", "delete-item"] as KeybindAction[],
  },
];

const searchQuery = ref("");
const recordingAction = ref<KeybindAction | null>(null);

const currentBindings = ref<Record<KeybindAction, Keybind>>(
  ALL_KEYBIND_ACTIONS.reduce((acc, action) => {
    acc[action] = getKeybind(action);
    return acc;
  }, {} as Record<KeybindAction, Keybind>)
);

const filteredGroups = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return groups;

  return groups
    .map((group) => {
      const filteredActions = group.actions.filter((action) => {
        const label = actionLabels[action].toLowerCase();
        const actionStr = action.toLowerCase();
        return label.includes(query) || actionStr.includes(query);
      });
      return {
        ...group,
        actions: filteredActions,
      };
    })
    .filter((group) => group.actions.length > 0);
});

function startRecording(action: KeybindAction) {
  recordingAction.value = action;
  window.addEventListener("keydown", handleKeydown, true);
}

function stopRecording() {
  recordingAction.value = null;
  window.removeEventListener("keydown", handleKeydown, true);
}

async function handleKeydown(event: KeyboardEvent) {
  if (!recordingAction.value) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  if (event.key === "Escape") {
    stopRecording();
    return;
  }

  const newBind = parseKeyboardEventToKeybind(event);
  if (newBind) {
    const action = recordingAction.value;
    currentBindings.value[action] = newBind;
    await setKeybind(action, newBind);
    pushAppToast(`Shortcut for "${actionLabels[action]}" updated`, "success");
    stopRecording();
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-base font-semibold text-[var(--oterm-text)]">Key Mapping</h2>
        <p class="mt-1 text-sm text-[var(--oterm-muted)]">
          Customize keyboard shortcuts for application actions.
        </p>
      </div>

      <div class="relative w-full sm:w-64">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search shortcuts..."
          class="w-full rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)] py-1.5 pl-3 pr-8 text-sm text-[var(--oterm-text)] placeholder-[var(--oterm-muted)] focus:border-[var(--oterm-accent)] focus:outline-none"
        />
        <button
          v-if="searchQuery"
          class="absolute right-2.5 top-2 text-[var(--oterm-muted)] hover:text-[var(--oterm-text)]"
          @click="searchQuery = ''"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <div v-if="filteredGroups.length === 0" class="rounded-lg border border-[var(--oterm-border)] p-8 text-center text-sm text-[var(--oterm-muted)]">
      No shortcuts matching "{{ searchQuery }}"
    </div>

    <div v-else class="flex flex-col gap-6">
      <div
        v-for="group in filteredGroups"
        :key="group.name"
        class="flex flex-col gap-2"
      >
        <h3 class="text-xs font-semibold uppercase tracking-wider text-[var(--oterm-muted)] px-1">
          {{ group.name }}
        </h3>
        
        <div class="rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-panel)]">
          <div
            v-for="action in group.actions"
            :key="action"
            class="flex items-center justify-between border-b border-[var(--oterm-border)] p-4 last:border-b-0"
          >
            <div class="text-sm font-medium text-[var(--oterm-text)]">
              {{ actionLabels[action] }}
            </div>
            <button
              class="min-w-[120px] rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-sm transition focus:outline-none"
              :class="
                recordingAction === action
                  ? 'bg-[var(--oterm-accent)] text-black border-transparent shadow-[0_0_0_2px_rgba(0,229,186,0.3)] font-medium'
                  : 'bg-white/5 hover:bg-white/10 text-[var(--oterm-text)]'
              "
              @click="startRecording(action)"
            >
              <template v-if="recordingAction === action">
                Recording...
              </template>
              <template v-else>
                {{ formatKeybind(currentBindings[action]) }}
              </template>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
