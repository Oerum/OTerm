<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { entryAccentColor } from "../lib/sidebarEntries";
import type { TerminalMenuActionId, TerminalSidebarEntry } from "../types/terminal";
import AgentFooterBadge from "./AgentFooterBadge.vue";
import GitDiffBadge from "./GitDiffBadge.vue";
import TerminalEntryMenu from "./TerminalEntryMenu.vue";

const props = defineProps<{
  entry: TerminalSidebarEntry;
  menuOpen: boolean;
  renaming: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
}>();

const emit = defineEmits<{
  select: [tabId: string, paneId: string];
  menuToggle: [entryId: string, open: boolean];
  action: [actionId: TerminalMenuActionId];
  colorChange: [color: import("../types/terminal").TerminalEntryColor];
  renameCommit: [tabId: string, title: string];
  renameCancel: [];
  dragStart: [tabId: string, terminalTabIndex: number, event: PointerEvent];
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

const showUnseenNotification = computed(
  () => props.entry.hasUnseenNotification && !props.entry.isActive,
);

const showBranchFooter = computed(
  () => props.entry.gitIsRepo && !!props.entry.gitBranch,
);

const accentStyle = computed(() => {
  const color = entryAccentColor(props.entry.tabColor);
  const accentWidth = props.entry.isActive ? "3px" : "2px";
  if (props.entry.isActive && props.entry.tabColor === "none") {
    return { boxShadow: `inset ${accentWidth} 0 0 0 var(--oterm-accent)` };
  }
  if (props.entry.tabColor === "none") return undefined;
  return { boxShadow: `inset ${accentWidth} 0 0 0 ${color}` };
});

const iconSizeClass = computed(() =>
  props.entry.splitIndex != null && props.entry.splitIndex > 1 ? "h-4 w-4" : "h-5 w-5",
);

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

function onDragHandlePointerDown(event: PointerEvent) {
  emit("dragStart", props.entry.tabId, props.entry.terminalTabIndex, event);
}
</script>

<template>
  <div class="relative mb-0.5">
    <div
      v-if="dropTarget"
      class="pointer-events-none absolute inset-x-0 -top-px z-10 h-0.5 rounded-full bg-[var(--oterm-accent)]"
      aria-hidden="true"
    />

    <div
      class="no-drag group relative flex w-full items-center gap-1 rounded-md border px-1.5 transition-colors duration-[120ms]"
      :class="[
        showBranchFooter ? 'py-1.5' : 'py-1',
        entry.isActive
          ? 'border-[var(--oterm-accent)]/25 bg-[var(--oterm-accent-dim)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] ring-1 ring-inset ring-[var(--oterm-accent)]/15'
          : 'border-[var(--oterm-border)] bg-[var(--term-entry-bg)] hover:border-[var(--oterm-border-strong)] hover:bg-white/[0.04]',
        entry.splitIndex != null && entry.splitIndex > 1 ? 'ml-4 border-l border-white/[0.08] pl-1.5' : '',
        renaming ? 'ring-1 ring-[var(--oterm-border-strong)]' : '',
        dragging ? 'opacity-50' : '',
      ]"
      :style="accentStyle"
      :data-terminal-tab-index="entry.terminalTabIndex"
      :data-terminal-tab-id="entry.tabId"
      :aria-current="entry.isActive ? 'true' : undefined"
      @keydown="onMenuKeyDown"
    >
      <button
        v-if="entry.isFirstPaneOfTab && !renaming"
        type="button"
        class="flex h-5 w-3.5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-[var(--oterm-faint)] opacity-0 transition hover:bg-white/5 hover:text-[var(--oterm-muted)] active:cursor-grabbing group-hover:opacity-100"
        title="Drag to reorder"
        aria-label="Drag to reorder tab"
        @pointerdown="onDragHandlePointerDown"
        @click.stop
      >
        <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor" aria-hidden="true">
          <circle cx="2" cy="2" r="0.9" />
          <circle cx="6" cy="2" r="0.9" />
          <circle cx="2" cy="5" r="0.9" />
          <circle cx="6" cy="5" r="0.9" />
          <circle cx="2" cy="8" r="0.9" />
          <circle cx="6" cy="8" r="0.9" />
        </svg>
      </button>

      <div
        class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        :class="renaming ? '' : 'cursor-pointer'"
        @click="onRowClick"
      >
      <span
        class="flex shrink-0 items-center justify-center rounded-md"
        :class="[
          iconSizeClass,
          entry.activeAgentId
            ? entry.isActive
              ? 'bg-white/[0.08] ring-1 ring-[var(--oterm-accent)]/20'
              : 'bg-[var(--oterm-elevated)] ring-1 ring-white/[0.06]'
            : entry.isActive
              ? 'bg-white/[0.08] text-[var(--oterm-text)] ring-1 ring-[var(--oterm-accent)]/20'
              : 'bg-[var(--oterm-elevated)] text-[var(--oterm-muted)]',
        ]"
      >
        <AgentFooterBadge
          v-if="entry.activeAgentId"
          :agent-id="entry.activeAgentId"
        />
        <svg
          v-else-if="entry.splitIndex != null && entry.splitIndex > 1"
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
          class="block h-[18px] w-full truncate rounded border border-[var(--oterm-border-strong)] bg-[var(--oterm-bg)] px-1 text-[0.75rem] font-medium leading-[1.2] text-[var(--oterm-text)] outline-none ring-[var(--oterm-accent)] focus:ring-1"
          aria-label="Tab name"
          @click.stop
          @keydown="onRenameKeyDown"
          @blur="onRenameBlur"
        />
        <span
          v-else
          class="block truncate text-[0.75rem] font-medium leading-[1.2]"
          :class="entry.isActive ? 'text-[var(--oterm-text)]' : 'text-[var(--term-entry-text)]'"
        >
          {{ entry.title }}
        </span>
        <span class="flex items-center gap-1 text-[10px] leading-[1.2] text-[var(--oterm-faint)]">
          <span class="min-w-0 truncate">{{ entry.subtitle }}</span>
          <GitDiffBadge
            v-if="entry.gitIsRepo"
            :git-status="gitStatus"
            readonly
            compact
          />
        </span>
        <span
          v-if="showBranchFooter"
          class="mt-0.5 flex items-center gap-1 text-[10px] leading-[1.2] text-[var(--oterm-muted)]"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            class="shrink-0"
            aria-hidden="true"
          >
            <circle cx="4.5" cy="4.5" r="1.5" stroke-width="1.2" />
            <circle cx="11.5" cy="11.5" r="1.5" stroke-width="1.2" />
            <path d="M6 4.5h3.5a2 2 0 0 1 2 2V9" stroke-width="1.2" stroke-linecap="round" />
          </svg>
          <span class="min-w-0 truncate font-mono">{{ entry.gitBranch }}</span>
        </span>
      </span>
      </div>

    <svg
      v-if="showUnseenNotification"
      class="h-3 w-3 shrink-0 text-[var(--warp-accent)]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-label="Unseen notification"
      role="status"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>

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
            ? 'bg-white/5 text-[var(--oterm-text)]'
            : 'text-[var(--oterm-faint)] hover:bg-white/10 hover:text-[var(--oterm-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--oterm-accent)]',
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
