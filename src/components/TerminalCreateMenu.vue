<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { CreateMenuAction, ShellProfile } from "../types/terminal";
import { formatKeybind, getKeybind, isActionKeybind } from "../lib/keybindSettings";

import { handleMenuNavigationKey } from "../lib/menuKeyboardNav";

const props = defineProps<{
  shells: ShellProfile[];
  defaultShellId: string;
  canReopenClosed: boolean;
}>();

const emit = defineEmits<{
  select: [action: CreateMenuAction];
  "set-default": [shellId: string];
  close: [];
}>();

interface MenuRow {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  disabledReason?: string;
  action: CreateMenuAction;
  section: "launchers" | "configs" | "footer";
  shellId?: string;
  submenu?: boolean;
}

const menuRef = ref<HTMLElement | null>(null);
const focusIndex = ref(0);

const systemShells = computed(() =>
  props.shells.filter((shell) => !shell.id.startsWith("profile-")),
);

const profileShells = computed(() =>
  props.shells.filter((shell) => shell.id.startsWith("profile-")),
);

const rows = computed<MenuRow[]>(() => {
  const items: MenuRow[] = [
    {
      id: "default-terminal",
      label: "Terminal",
      shortcut: formatKeybind(getKeybind("terminal-new")),
      action: { kind: "default-terminal" },
      section: "launchers",
    },
    {
      id: "ungrouped-terminal",
      label: "Ungrouped Terminal",
      shortcut: formatKeybind(getKeybind("terminal-new-ungrouped")),
      action: { kind: "ungrouped-terminal" },
      section: "launchers",
    },
    ...systemShells.value.map((shell) => ({
      id: `shell-${shell.id}`,
      label: shell.label,
      action: { kind: "shell" as const, shellId: shell.id },
      section: "launchers" as const,
      shellId: shell.id,
    })),
    ...profileShells.value.map((shell) => ({
      id: `profile-${shell.id}`,
      label: `New tab: ${shell.label}`,
      action: { kind: "shell" as const, shellId: shell.id },
      section: "launchers" as const,
      shellId: shell.id,
    })),
    {
      id: "reopen-closed",
      label: "Reopen closed session",
      shortcut: formatKeybind(getKeybind("terminal-reopen")),
      disabled: !props.canReopenClosed,
      disabledReason: "No closed sessions",
      action: { kind: "reopen-closed" },
      section: "footer",
    },
  ];
  return items;
});

const enabledIndices = computed(() =>
  rows.value.flatMap((row, i) => (row.disabled ? [] : [i])),
);

function isDefaultShell(shellId: string) {
  return shellId === props.defaultShellId;
}

function run(row: MenuRow) {
  if (row.disabled) return;
  emit("select", row.action);
}

function makeDefault(event: MouseEvent, shellId: string) {
  event.preventDefault();
  event.stopPropagation();
  if (isDefaultShell(shellId)) return;
  emit("set-default", shellId);
}

function focusItem(index: number) {
  nextTick(() => {
    menuRef.value?.querySelectorAll<HTMLButtonElement>('[data-create-item="true"]')[index]?.focus();
  });
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }

  const enabled = enabledIndices.value;
  if (enabled.length === 0) return;

  const row = rows.value[focusIndex.value];

  if (isActionKeybind(event, "terminal-set-default") && row?.shellId) {
    event.preventDefault();
    emit("set-default", row.shellId);
    return;
  }

  if (
    handleMenuNavigationKey(event, enabled, focusIndex.value, (next) => {
      focusIndex.value = next;
      focusItem(next);
    })
  ) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (row && !row.disabled) run(row);
  }
}

watch(
  () => props.shells.length,
  () => {
    const first = enabledIndices.value[0] ?? 0;
    focusIndex.value = first;
  },
  { immediate: true },
);

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
  const first = enabledIndices.value[0] ?? 0;
  focusIndex.value = first;
  nextTick(() => focusItem(first));
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeyDown);
});
</script>

<template>
  <div
    ref="menuRef"
    id="term-create-menu"
    role="menu"
    aria-label="Create terminal"
    class="no-drag term-create-menu z-50 shadow-xl"
    @mousedown.stop
  >
    <template v-for="(row, index) in rows" :key="row.id">
      <div
        v-if="index > 0 && row.section !== rows[index - 1]!.section"
        role="separator"
        class="term-create-separator"
      />

      <div
        class="term-create-row group/row"
        :class="{ 'term-create-row--disabled': row.disabled }"
        :title="row.disabled ? row.disabledReason : undefined"
      >
        <button
          type="button"
          role="menuitem"
          data-create-item="true"
          class="term-create-item"
          :class="{
            'term-create-item--default': row.shellId && isDefaultShell(row.shellId),
            'term-create-item--disabled': row.disabled,
          }"
          :disabled="row.disabled"
          @click="run(row)"
        >
          <span
            class="term-create-item__label min-w-0 truncate"
            :class="row.shellId && isDefaultShell(row.shellId) ? 'text-(--term-create-accent)' : ''"
          >
            {{ row.label }}
          </span>
          <span v-if="row.submenu" class="term-create-item__submenu" aria-hidden="true">▸</span>
          <span v-if="row.shortcut" class="term-create-item__shortcut">{{ row.shortcut }}</span>
        </button>

        <button
          v-if="row.shellId"
          type="button"
          class="term-create-star"
          :class="{
            'term-create-star--active': isDefaultShell(row.shellId),
            'term-create-star--idle': !isDefaultShell(row.shellId),
          }"
          :title="
            isDefaultShell(row.shellId)
              ? 'Default for Ctrl+Shift+T'
              : 'Set as default for Ctrl+Shift+T'
          "
          :aria-label="
            isDefaultShell(row.shellId)
              ? 'Default terminal for Ctrl+Shift+T'
              : 'Set as default terminal for Ctrl+Shift+T'
          "
          :aria-pressed="isDefaultShell(row.shellId)"
          @click="makeDefault($event, row.shellId)"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              v-if="isDefaultShell(row.shellId)"
              d="M6 1.2 7.4 4.6 11 4.9 8.3 7.3 9.1 10.8 6 8.9 2.9 10.8 3.7 7.3 1 4.9 4.6 4.6 6 1.2Z"
              fill="currentColor"
            />
            <path
              v-else
              d="M6 1.6 7.1 4.4 10.1 4.7 7.9 6.7 8.5 9.7 6 8.2 3.5 9.7 4.1 6.7 1.9 4.7 4.9 4.4 6 1.6Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.1"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.term-create-menu {
  width: 100%;
  background: #16161e; /* Solid background instead of var(--term-create-bg) */
  border: 1px solid var(--term-create-border);
  border-radius: var(--term-create-radius);
  padding: 4px 0;
  font-size: var(--term-create-font);
  line-height: 1.2;
}

.term-create-row {
  display: flex;
  align-items: stretch;
  padding-right: 4px;
}

.term-create-row--disabled .term-create-star {
  display: none;
}

.term-create-item {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 6px;
  padding: var(--term-create-pad-y) var(--term-create-pad-x);
  text-align: left;
  color: var(--term-create-text);
  transition: background 120ms ease;
}

.term-create-item:hover:not(:disabled),
.term-create-item:focus-visible:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  outline: none;
}

.term-create-item--disabled {
  cursor: not-allowed;
  opacity: 0.4;
  pointer-events: none;
}

.term-create-item__label {
  flex: 1;
}

.term-create-item__submenu {
  font-size: 10px;
  color: var(--term-create-text-muted);
}

.term-create-item__shortcut {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--term-create-text-muted);
  font-variant-numeric: tabular-nums;
}

.term-create-star {
  display: flex;
  width: 26px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  align-self: center;
  border-radius: 4px;
  color: var(--term-create-text-muted);
  transition:
    opacity 120ms ease,
    color 120ms ease,
    background 120ms ease;
}

.term-create-star--active {
  color: var(--term-create-accent);
  opacity: 1;
}

.term-create-star--idle {
  opacity: 0;
}

.group\/row:hover .term-create-star--idle,
.group\/row:focus-within .term-create-star--idle {
  opacity: 1;
}

.term-create-star:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--term-create-accent);
}

.term-create-star:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px var(--term-create-accent);
}

.term-create-separator {
  margin: 4px 0;
  border-top: 1px solid var(--term-create-border);
}
</style>
