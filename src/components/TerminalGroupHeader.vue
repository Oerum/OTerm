<script setup lang="ts">
import { ref, watch } from "vue";
import { entryAccentColor } from "../lib/sidebarEntries";
import type { TerminalEntryColor } from "../types/terminal";
import TerminalGroupMenu from "./TerminalGroupMenu.vue";

const props = defineProps<{
  groupId: string | null;
  name: string;
  tabCount: number;
  collapsed: boolean;
  color: TerminalEntryColor;
  dropTarget?: boolean;
  renaming?: boolean;
  menuOpen?: boolean;
  isDraggingAny?: boolean;
}>();

const emit = defineEmits<{
  toggleCollapse: [];
  renameCommit: [name: string];
  renameCancel: [];
  deleteGroup: [];
  colorChange: [color: TerminalEntryColor];
  menuToggle: [open: boolean];
  startRename: [];
}>();

const renameValue = defineModel<string>("renameValue", { default: "" });

const openUpward = ref(false);
const dotMenuRef = ref<HTMLElement | null>(null);

function onRenameKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    event.preventDefault();
    emit("renameCommit", renameValue.value.trim() || props.name);
  }
  if (event.key === "Escape") {
    event.preventDefault();
    emit("renameCancel");
  }
}

function onRowClick() {
  if (props.renaming) return;
  emit("toggleCollapse");
}

function onMenuClick() {
  emit("menuToggle", !props.menuOpen);
}

function onRenameAction() {
  emit("menuToggle", false);
  emit("startRename");
}

function onContextMenu() {
  if (props.groupId) {
    emit("menuToggle", true);
  }
}

watch(
  () => props.menuOpen,
  (isOpen) => {
    if (isOpen && dotMenuRef.value) {
      const rect = dotMenuRef.value.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      openUpward.value = spaceBelow < 180 && rect.top > spaceBelow;
    }
  }
);
</script>

<template>
  <div
    class="no-drag group/header relative flex w-full items-center gap-1 rounded-lg pl-0 pr-2 py-1.5 text-left transition-all duration-[120ms] select-none mt-2.5 first:mt-0"
    :class="[
      dropTarget
        ? 'bg-[var(--oterm-accent)]/10 ring-1 ring-[var(--oterm-accent)]/40'
        : 'hover:bg-white/[0.03] hover:text-[var(--oterm-text)]',
      menuOpen ? 'bg-white/[0.03]' : '',
    ]"
    :data-terminal-group-drop="groupId ?? 'ungrouped'"
    :data-group-id="groupId ?? 'ungrouped'"
    @click="onRowClick"
    @dblclick="onRenameAction"
    @contextmenu.prevent.stop="onContextMenu"
  >
    <!-- Chevron collapse button -->
    <button
      type="button"
      class="flex h-5 w-3 shrink-0 items-center justify-center text-[var(--oterm-faint)] hover:text-[var(--oterm-text)] transition"
      :aria-label="collapsed ? 'Expand group' : 'Collapse group'"
      @click.stop="emit('toggleCollapse')"
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="transition-transform duration-[120ms] text-[var(--oterm-faint)] group-hover/header:text-[var(--oterm-muted)]"
        :class="collapsed ? '' : 'rotate-90'"
      >
        <polyline points="6 3 11 8 6 13" />
      </svg>
    </button>

    <!-- Folder icon (colored by theme/accent color) -->
    <span class="flex shrink-0 items-center justify-center">
      <!-- Closed Folder Icon -->
      <svg
        v-if="collapsed"
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="shrink-0 transition-colors duration-[120ms]"
        :style="{ color: color === 'none' ? 'var(--oterm-muted)' : entryAccentColor(color) }"
      >
        <path d="M1.5 3h5.5l1.5 1.5h6A1.5 1.5 0 0 1 16 6v7.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 0 13.5v-9A1.5 1.5 0 0 1 1.5 3z" />
      </svg>
      <!-- Open Folder Icon -->
      <svg
        v-else
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="shrink-0 transition-colors duration-[120ms]"
        :style="{ color: color === 'none' ? 'var(--oterm-muted)' : entryAccentColor(color) }"
      >
        <path d="M1.5 3h5.5l1.5 1.5h6A1.5 1.5 0 0 1 16 6v2H0V4.5A1.5 1.5 0 0 1 1.5 3z" />
        <path d="M0 8h16v5.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 0 13.5V8z" />
      </svg>
    </span>

    <!-- Group Name Input / Label -->
    <div v-if="renaming" class="min-w-0 flex-1" @click.stop>
      <input
        v-model="renameValue"
        type="text"
        class="w-full rounded border border-[var(--oterm-border-strong)] bg-[var(--oterm-bg)] px-1.5 py-0.5 text-[11px] text-[var(--oterm-text)] outline-none focus:border-[var(--oterm-accent)]"
        autofocus
        @keydown="onRenameKeydown"
        @blur="emit('renameCommit', renameValue.trim() || name)"
      />
    </div>
    
    <template v-else>
      <span 
        class="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--oterm-muted)] group-hover/header:text-[var(--oterm-text)] transition-colors"
        :class="{ 'text-[var(--oterm-text)]': !collapsed }"
      >
        {{ name }}
      </span>

      <!-- Count badge -->
      <span class="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-white/[0.04] px-1.5 text-[9px] font-semibold font-mono text-[var(--oterm-faint)] group-hover/header:text-[var(--oterm-muted)] group-hover/header:bg-white/[0.07] transition-all">
        {{ tabCount }}
      </span>

      <!-- Action dot-menu -->
      <div v-if="groupId && !isDraggingAny" ref="dotMenuRef" class="relative shrink-0" @click.stop>
        <button
          type="button"
          class="flex h-5 w-5 items-center justify-center rounded transition-opacity duration-[120ms] text-[var(--oterm-faint)] hover:bg-white/10 hover:text-[var(--oterm-text)]"
          :class="[
            menuOpen ? 'opacity-100 bg-white/5 text-[var(--oterm-text)]' : 'opacity-0 group-hover/header:opacity-100',
          ]"
          title="Group actions"
          aria-label="Group actions"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          @click="onMenuClick"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <circle cx="5" cy="2" r="0.9" fill="currentColor" />
            <circle cx="5" cy="5" r="0.9" fill="currentColor" />
            <circle cx="5" cy="8" r="0.9" fill="currentColor" />
          </svg>
        </button>

        <Transition name="term-menu">
          <TerminalGroupMenu
            v-if="menuOpen && !renaming"
            :open="menuOpen"
            :color="color"
            :open-upward="openUpward"
            @close="emit('menuToggle', false)"
            @rename="onRenameAction"
            @delete="emit('deleteGroup')"
            @color-change="(c) => emit('colorChange', c)"
          />
        </Transition>
      </div>
    </template>
  </div>
</template>
