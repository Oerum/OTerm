<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { ENTRY_COLORS } from "../lib/sidebarEntries";
import type { TerminalEntryColor, TerminalMenuActionId, TerminalSidebarEntry, TerminalTabGroup } from "../types/terminal";

const props = defineProps<{
  entry: TerminalSidebarEntry;
  open: boolean;
  openUpward?: boolean;
  groups?: TerminalTabGroup[];
}>();

const emit = defineEmits<{
  close: [];
  action: [actionId: TerminalMenuActionId];
  colorChange: [color: TerminalEntryColor];
  moveToGroup: [groupId: string | null];
  newGroupAndMove: [];
}>();

const menuRef = ref<HTMLElement | null>(null);
const focusIndex = ref(0);

const isCustomColor = computed(() => {
  return props.entry.tabColor !== "none" && !ENTRY_COLORS.some(c => c.id === props.entry.tabColor);
});

const customColorHex = computed(() => {
  if (isCustomColor.value && props.entry.tabColor.startsWith("#") && props.entry.tabColor.length === 7) {
    return props.entry.tabColor;
  }
  return "#00e5ba";
});

function onColorPickerInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  emit("colorChange", value);
}

function onCustomColorTextChange(event: Event) {
  const value = (event.target as HTMLInputElement).value.trim();
  if (!value) {
    emit("colorChange", "none");
  } else {
    emit("colorChange", value);
  }
}

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
  { id: "split-pane", label: "Split" },
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
  { id: "save-as-profile", label: "Save as profile", separatorBefore: true },
]);

const groupMoveItems = computed(() => {
  const items: { groupId: string | null; label: string }[] = [];
  if (props.entry.groupId) {
    items.push({ groupId: null, label: "Move to Ungrouped" });
  }
  for (const group of props.groups ?? []) {
    if (group.id === props.entry.groupId) continue;
    items.push({ groupId: group.id, label: `Move to ${group.name}` });
  }
  return items;
});

const showGroupSection = true;

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
    class="no-drag term-entry-menu absolute right-0 z-50 w-[var(--term-menu-width)] overflow-hidden rounded-md border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] py-0.5 shadow-xl"
    :class="openUpward ? 'bottom-full mb-0.5' : 'top-full mt-0.5'"
    @mousedown.stop
  >
    <template v-for="item in items" :key="item.id">
      <div
        v-if="item.separatorBefore"
        role="separator"
        class="my-0.5 border-t border-[var(--oterm-border)]"
      />
      <div
        class="w-full"
        :title="item.disabled ? item.disabledReason : undefined"
      >
        <button
          type="button"
          role="menuitem"
          data-menu-item="true"
          class="flex w-full px-2 py-1 text-left text-[0.75rem] leading-[1.2] transition"
          :class="[
            item.destructive ? 'text-[#ff7b72]' : 'text-[var(--oterm-text)]',
            item.disabled
              ? 'pointer-events-none cursor-not-allowed opacity-40'
              : 'hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--oterm-accent)] focus-visible:ring-inset',
          ]"
          :disabled="item.disabled"
          @click="run(item.id)"
        >
          {{ item.label }}
        </button>
      </div>
    </template>

    <template v-if="showGroupSection">
      <div role="separator" class="my-0.5 border-t border-[var(--oterm-border)]" />
      <button
        v-for="item in groupMoveItems"
        :key="item.groupId ?? 'ungrouped'"
        type="button"
        role="menuitem"
        data-menu-item="true"
        class="flex w-full px-2 py-1 text-left text-[0.75rem] leading-[1.2] text-[var(--oterm-text)] transition hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--oterm-accent)] focus-visible:ring-inset"
        @click="emit('moveToGroup', item.groupId)"
      >
        {{ item.label }}
      </button>
      <button
        type="button"
        role="menuitem"
        data-menu-item="true"
        class="flex w-full px-2 py-1 text-left text-[0.75rem] leading-[1.2] text-[var(--oterm-text)] transition hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--oterm-accent)] focus-visible:ring-inset"
        @click="emit('newGroupAndMove')"
      >
        New group and move
      </button>
    </template>

    <div role="separator" class="my-0.5 border-t border-[var(--oterm-border)]" />

    <div
      role="radiogroup"
      aria-label="Tab color"
      class="flex items-center justify-between px-2 py-1.5"
    >
      <button
        v-for="color in ENTRY_COLORS"
        :key="color.id"
        type="button"
        role="radio"
        class="term-color-swatch h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-offset-1 ring-offset-[var(--oterm-elevated)] transition focus:outline-none focus-visible:ring-[var(--oterm-text)]"
        :class="entry.tabColor === color.id ? 'ring-[var(--oterm-text)]' : 'ring-transparent'"
        :style="{ backgroundColor: color.hex }"
        :aria-checked="entry.tabColor === color.id"
        :aria-label="color.label"
        :title="color.label"
        @click="emit('colorChange', color.id)"
      />
      <!-- Custom Color Spectrum Swatch -->
      <label
        class="term-color-swatch relative h-2.5 w-2.5 shrink-0 cursor-pointer rounded-full ring-1 ring-offset-1 ring-offset-[var(--oterm-elevated)] transition"
        :class="isCustomColor ? 'ring-[var(--oterm-text)]' : 'ring-transparent'"
        style="background: linear-gradient(135deg, #ff0055 0%, #00ffcc 50%, #9900ff 100%)"
        title="Custom color..."
      >
        <input
          type="color"
          class="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          :value="customColorHex"
          @input="onColorPickerInput"
        />
      </label>
    </div>

    <!-- Custom RGBA Input -->
    <div class="flex items-center gap-1 px-2 pb-1.5 pt-0.5">
      <input
        type="text"
        class="w-full rounded border border-[var(--oterm-border-strong)] bg-[var(--oterm-bg)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--oterm-text)] outline-none focus:border-[var(--oterm-accent)]/60 focus:ring-1 focus:ring-[var(--oterm-accent)]/15"
        placeholder="Custom hex/rgba..."
        :value="entry.tabColor !== 'none' && !ENTRY_COLORS.some(c => c.id === entry.tabColor) ? entry.tabColor : ''"
        @change="onCustomColorTextChange"
        @keydown.stop
      />
    </div>
  </div>
</template>

<style scoped>
@media (prefers-reduced-motion: reduce) {
  .term-color-swatch {
    transition: none;
  }

  .term-color-swatch:hover {
    transform: none;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .term-color-swatch:hover {
    transform: scale(1.05);
  }
}
</style>
