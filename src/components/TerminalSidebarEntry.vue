<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { entryAccentColor } from "../lib/sidebarEntries";
import type { TerminalMenuActionId, TerminalSidebarEntry } from "../types/terminal";
import GitDiffBadge from "./GitDiffBadge.vue";
import TerminalEntryMenu from "./TerminalEntryMenu.vue";

const props = defineProps<{
  entry: TerminalSidebarEntry;
  menuOpen: boolean;
  renaming: boolean;
}>();

const emit = defineEmits<{
  select: [tabId: string, paneId: string];
  menuToggle: [entryId: string, open: boolean];
  action: [actionId: TerminalMenuActionId];
  colorChange: [color: import("../types/terminal").TerminalEntryColor];
  renameCommit: [tabId: string, title: string];
  renameCancel: [];
}>();

const renameInputRef = ref<HTMLInputElement | null>(null);
const renameDraft = ref("");
const skipBlurCommit = ref(false);

const gitStatus = computed(() => ({
  isRepo: props.entry.gitIsRepo,
  branch: props.entry.gitBranch,
  changedFiles: props.entry.gitChangedFiles,
  additions: props.entry.gitAdditions,
  deletions: props.entry.gitDeletions,
}));

const accentStyle = computed(() => {
  if (props.entry.tabColor === "none" && !props.entry.isActive) return undefined;
  const color = entryAccentColor(props.entry.tabColor);
  if (props.entry.isActive && props.entry.tabColor === "none") {
    return { boxShadow: "inset 2px 0 0 0 var(--warp-line)" };
  }
  return { boxShadow: `inset 2px 0 0 0 ${color}` };
});

watch(
  () => props.renaming,
  (renaming) => {
    if (!renaming) return;
    renameDraft.value = props.entry.renameDefault;
    nextTick(() => {
      renameInputRef.value?.focus();
      renameInputRef.value?.select();
    });
  },
);

function onRowClick() {
  if (props.renaming) return;
  emit("select", props.entry.tabId, props.entry.paneId);
}

function onMenuClick() {
  emit("menuToggle", props.entry.entryId, !props.menuOpen);
}

function onMenuKeyDown(event: KeyboardEvent) {
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    event.preventDefault();
    emit("menuToggle", props.entry.entryId, true);
  }
}

function commitRename() {
  emit("renameCommit", props.entry.tabId, renameDraft.value);
}

function cancelRename() {
  skipBlurCommit.value = true;
  emit("renameCancel");
}

function onRenameBlur() {
  if (skipBlurCommit.value) {
    skipBlurCommit.value = false;
    return;
  }
  commitRename();
}

function onRenameKeyDown(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.key === "Enter") {
    event.preventDefault();
    skipBlurCommit.value = true;
    commitRename();
  } else if (event.key === "Escape") {
    event.preventDefault();
    cancelRename();
  }
}
</script>

<template>
  <div
    class="no-drag group relative mb-1 flex w-full items-start gap-2 rounded-lg px-2.5 py-2 transition"
    :class="[
      entry.isActive ? 'bg-[var(--warp-elevated)]' : 'hover:bg-white/[0.04]',
      entry.splitIndex != null && entry.splitIndex > 1 ? 'ml-5 border-l border-white/[0.08] pl-2' : '',
      renaming ? 'ring-1 ring-[var(--warp-border-strong)]' : '',
    ]"
    :style="accentStyle"
    @keydown="onMenuKeyDown"
  >
    <div
      class="flex min-w-0 flex-1 items-start gap-2 text-left"
      :class="renaming ? '' : 'cursor-pointer'"
      @click="onRowClick"
    >
      <span
        class="mt-0.5 flex shrink-0 items-center justify-center rounded-md"
        :class="[
          entry.splitIndex != null && entry.splitIndex > 1 ? 'h-6 w-6' : 'h-7 w-7',
          entry.isActive
            ? 'bg-white/[0.07] text-[var(--warp-text)]'
            : 'bg-[var(--warp-elevated)] text-[var(--warp-muted)]',
        ]"
      >
        <svg
          v-if="entry.splitIndex != null && entry.splitIndex > 1"
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
        >
          <path
            d="M4 3.5h6.5a1.5 1.5 0 0 1 1.5 1.5V9M4 3.5 7 6.5 4 9.5M4 3.5v6"
            stroke-width="1.3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <svg
          v-else
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
        >
          <path
            d="M3 4.5 6.5 8 3 11.5M8 11.5h5"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>

      <span class="min-w-0 flex-1">
        <input
          v-if="renaming"
          ref="renameInputRef"
          v-model="renameDraft"
          type="text"
          class="block w-full truncate rounded border border-[var(--warp-border-strong)] bg-[var(--warp-bg)] px-1.5 py-0.5 text-sm font-medium text-[var(--warp-text)] outline-none ring-[var(--warp-accent)] focus:ring-1"
          aria-label="Tab name"
          @click.stop
          @keydown="onRenameKeyDown"
          @blur="onRenameBlur"
        />
        <span
          v-else
          class="block truncate text-sm font-medium"
          :class="entry.isActive ? 'text-[var(--warp-text)]' : 'text-[var(--warp-muted)]'"
        >
          {{ entry.title }}
        </span>
        <span class="flex items-center gap-1.5 text-[11px] text-[var(--warp-faint)]">
          <span class="min-w-0 truncate">{{ entry.subtitle }}</span>
          <GitDiffBadge
            v-if="entry.gitIsRepo"
            :git-status="gitStatus"
            readonly
            compact
          />
        </span>
      </span>
    </div>

    <div class="relative shrink-0">
      <button
        v-if="!renaming"
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded text-base leading-none transition"
        :class="[
          menuOpen || entry.isActive
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
          menuOpen
            ? 'bg-white/5 text-[var(--warp-text)]'
            : 'text-[var(--warp-faint)] hover:bg-white/10 hover:text-[var(--warp-text)]',
        ]"
        title="Terminal actions"
        aria-label="Terminal actions"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        @click.stop="onMenuClick"
      >
        ···
      </button>

      <TerminalEntryMenu
        v-if="menuOpen && !renaming"
        :entry="entry"
        :open="menuOpen"
        @close="emit('menuToggle', entry.entryId, false)"
        @action="(id) => emit('action', id)"
        @color-change="(color) => emit('colorChange', color)"
      />
    </div>
  </div>
</template>
