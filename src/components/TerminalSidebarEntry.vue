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
  upstream: null,
  ahead: 0,
  behind: 0,
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
    class="no-drag group relative mb-0.5 flex w-full items-center gap-1.5 rounded-md border px-1.5 py-1 transition-colors duration-[120ms]"
    :class="[
      entry.isActive
        ? 'border-[var(--warp-border-strong)] bg-[var(--warp-elevated)]'
        : 'border-[var(--warp-border)] bg-[var(--term-entry-bg)] hover:border-[var(--warp-border-strong)] hover:bg-white/[0.04]',
      entry.splitIndex != null && entry.splitIndex > 1 ? 'ml-4 border-l border-white/[0.08] pl-1.5' : '',
      renaming ? 'ring-1 ring-[var(--warp-border-strong)]' : '',
    ]"
    :style="accentStyle"
    :aria-current="entry.isActive ? 'true' : undefined"
    @keydown="onMenuKeyDown"
  >
    <div
      class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      :class="renaming ? '' : 'cursor-pointer'"
      @click="onRowClick"
    >
      <span
        class="flex shrink-0 items-center justify-center rounded"
        :class="[
          entry.splitIndex != null && entry.splitIndex > 1 ? 'h-4 w-4' : 'h-5 w-5',
          entry.isActive
            ? 'bg-white/[0.07] text-[var(--warp-text)]'
            : 'bg-[var(--warp-elevated)] text-[var(--warp-muted)]',
        ]"
      >
        <svg
          v-if="entry.splitIndex != null && entry.splitIndex > 1"
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
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
          width="11"
          height="11"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            d="M3 4.5 6.5 8 3 11.5M8 11.5h5"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>

      <span class="min-w-0 flex-1 leading-[1.2]">
        <input
          v-if="renaming"
          ref="renameInputRef"
          v-model="renameDraft"
          type="text"
          class="block h-[18px] w-full truncate rounded border border-[var(--warp-border-strong)] bg-[var(--warp-bg)] px-1 text-[0.75rem] font-medium leading-[1.2] text-[var(--warp-text)] outline-none ring-[var(--warp-accent)] focus:ring-1"
          aria-label="Tab name"
          @click.stop
          @keydown="onRenameKeyDown"
          @blur="onRenameBlur"
        />
        <span
          v-else
          class="block truncate text-[0.75rem] font-medium leading-[1.2]"
          :class="entry.isActive ? 'text-[var(--warp-text)]' : 'text-[var(--term-entry-text)]'"
        >
          {{ entry.title }}
        </span>
        <span class="flex items-center gap-1 text-[10px] leading-[1.2] text-[var(--warp-faint)]">
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
        class="flex h-[22px] w-[22px] items-center justify-center rounded transition-opacity duration-[120ms]"
        :class="[
          menuOpen || entry.isActive
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
          menuOpen
            ? 'bg-white/5 text-[var(--warp-text)]'
            : 'text-[var(--warp-faint)] hover:bg-white/10 hover:text-[var(--warp-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--warp-accent)]',
        ]"
        title="Terminal actions"
        aria-label="Terminal actions"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        @click.stop="onMenuClick"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <circle cx="5" cy="2" r="0.9" fill="currentColor" />
          <circle cx="5" cy="5" r="0.9" fill="currentColor" />
          <circle cx="5" cy="8" r="0.9" fill="currentColor" />
        </svg>
      </button>

      <Transition name="term-menu">
        <TerminalEntryMenu
          v-if="menuOpen && !renaming"
          :entry="entry"
          :open="menuOpen"
          @close="emit('menuToggle', entry.entryId, false)"
          @action="(id) => emit('action', id)"
          @color-change="(color) => emit('colorChange', color)"
        />
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.term-menu-enter-active,
.term-menu-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.term-menu-enter-from,
.term-menu-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}

@media (prefers-reduced-motion: reduce) {
  .term-menu-enter-active,
  .term-menu-leave-active {
    transition: none;
  }

  .term-menu-enter-from,
  .term-menu-leave-to {
    transform: none;
  }
}
</style>
