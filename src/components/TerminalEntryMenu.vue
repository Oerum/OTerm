<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { ENTRY_COLORS } from "../lib/sidebarEntries";
import type { TerminalEntryColor, TerminalMenuActionId, TerminalSidebarEntry } from "../types/terminal";

const props = defineProps<{
  entry: TerminalSidebarEntry;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  action: [actionId: TerminalMenuActionId];
  colorChange: [color: TerminalEntryColor];
}>();

const menuRef = ref<HTMLElement | null>(null);
const focusIndex = ref(0);

interface MenuItem {
  id: TerminalMenuActionId;
  label: string;
  destructive?: boolean;
  separatorBefore?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

const items = computed<MenuItem[]>(() => [
  { id: "share-session", label: "Share session", disabled: !props.entry.sessionId, disabledReason: "No active session" },
  {
    id: "copy-branch",
    label: "Copy branch",
    disabled: !props.entry.gitIsRepo || !props.entry.gitBranch,
    disabledReason: "Not a git repository",
  },
  { id: "copy-pane-title", label: "Copy pane title" },
  { id: "copy-working-directory", label: "Copy working directory" },
  { id: "rename-tab", label: "Rename tab", separatorBefore: true },
  {
    id: "move-up",
    label: "Move tab up",
    disabled: !props.entry.canMoveUp,
    disabledReason: "Already at top",
  },
  {
    id: "move-down",
    label: "Move tab down",
    disabled: !props.entry.canMoveDown,
    disabledReason: "Already at bottom",
  },
  { id: "close-tab", label: "Close tab", separatorBefore: true, destructive: true },
  { id: "close-other-tabs", label: "Close other tabs", disabled: !props.entry.canCloseOthers },
  {
    id: "close-tabs-below",
    label: "Close tabs below",
    disabled: props.entry.entriesBelowCount === 0,
    disabledReason: "No tabs below",
  },
  { id: "save-as-profile", label: "Save as new config/profile", separatorBefore: true },
]);

const enabledIndices = computed(() =>
  items.value.flatMap((item, i) => (item.disabled ? [] : [i])),
);

function run(actionId: TerminalMenuActionId) {
  const item = items.value.find((entry) => entry.id === actionId);
  if (item?.disabled) return;
  emit("action", actionId);
}

function onKeyDown(event: KeyboardEvent) {
  if (!props.open) return;

  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }

  const enabled = enabledIndices.value;
  if (enabled.length === 0) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    const pos = enabled.indexOf(focusIndex.value);
    const next = pos === -1 || pos === enabled.length - 1 ? enabled[0] : enabled[pos + 1];
    focusIndex.value = next;
    focusItem(next);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    const pos = enabled.indexOf(focusIndex.value);
    const next = pos <= 0 ? enabled[enabled.length - 1] : enabled[pos - 1];
    focusIndex.value = next;
    focusItem(next);
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    focusIndex.value = enabled[0];
    focusItem(enabled[0]);
    return;
  }

  if (event.key === "End") {
    event.preventDefault();
    focusIndex.value = enabled[enabled.length - 1];
    focusItem(enabled[enabled.length - 1]);
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    const item = items.value[focusIndex.value];
    if (item && !item.disabled) run(item.id);
  }
}

function focusItem(index: number) {
  nextTick(() => {
    menuRef.value?.querySelectorAll<HTMLButtonElement>('[data-menu-item="true"]')[index]?.focus();
  });
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const first = enabledIndices.value[0] ?? 0;
    focusIndex.value = first;
    nextTick(() => focusItem(first));
  },
);

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
});
</script>

<template>
  <div
    ref="menuRef"
    role="menu"
    class="no-drag absolute right-0 top-full z-50 mt-1 min-w-[12.5rem] overflow-hidden rounded-lg border border-[var(--warp-border-strong)] bg-[var(--warp-elevated)] py-1 shadow-xl"
    @mousedown.stop
  >
    <template v-for="item in items" :key="item.id">
      <div
        v-if="item.separatorBefore"
        role="separator"
        class="my-1 border-t border-[var(--warp-border)]"
      />
      <button
        type="button"
        role="menuitem"
        data-menu-item="true"
        class="flex w-full px-3 py-1.5 text-left text-xs transition"
        :class="[
          item.destructive ? 'text-[#ff7b72]' : 'text-[var(--warp-text)]',
          item.disabled
            ? 'cursor-not-allowed opacity-40'
            : 'hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none',
        ]"
        :disabled="item.disabled"
        :title="item.disabled ? item.disabledReason : undefined"
        @click="run(item.id)"
      >
        {{ item.label }}
      </button>
    </template>

    <div role="separator" class="my-1 border-t border-[var(--warp-border)]" />

    <div
      role="radiogroup"
      aria-label="Tab color"
      class="flex items-center gap-1.5 px-3 py-2"
    >
      <button
        v-for="color in ENTRY_COLORS"
        :key="color.id"
        type="button"
        role="radio"
        class="h-4 w-4 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-[var(--warp-elevated)] transition hover:scale-110 focus:outline-none focus:ring-[var(--warp-text)]"
        :class="entry.tabColor === color.id ? 'ring-[var(--warp-text)]' : 'ring-transparent'"
        :style="{ backgroundColor: color.hex }"
        :aria-checked="entry.tabColor === color.id"
        :aria-label="color.label"
        :title="color.label"
        @click="emit('colorChange', color.id)"
      />
    </div>
  </div>
</template>
