<script setup lang="ts">
import { computed, ref } from "vue";
import { useMenuKeyboardNav } from "../composables/useMenuKeyboardNav";
import { useTabColor } from "../composables/useTabColor";
import type { TerminalEntryColor } from "../types/terminal";

const props = defineProps<{
  open: boolean;
  color: TerminalEntryColor;
  openUpward?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  rename: [];
  delete: [];
  colorChange: [color: TerminalEntryColor];
}>();

const menuRef = ref<HTMLElement | null>(null);

const colorRef = computed(() => props.color);
const {
  ENTRY_COLORS,
  isCustomColor,
  customColorHex,
  onColorPickerInput,
  onCustomColorTextChange,
} = useTabColor(colorRef, (event, val) => emit(event, val));

interface MenuItem {
  id: "rename" | "delete";
  label: string;
  destructive?: boolean;
}

const items = computed<MenuItem[]>(() => [
  { id: "rename", label: "Rename" },
  { id: "delete", label: "Delete", destructive: true },
]);

const enabledIndices = computed(() => [0, 1]);

function run(actionId: "rename" | "delete") {
  if (actionId === "rename") {
    emit("rename");
  } else if (actionId === "delete") {
    emit("delete");
  }
}

useMenuKeyboardNav({
  menuRef,
  getOpen: () => props.open,
  getEnabledIndices: () => enabledIndices.value,
  getItems: () => items.value,
  onClose: () => emit("close"),
  onRun: (id) => run(id as "delete" | "rename"),
  initialFocus: "zero",
});
</script>

<template>
  <div
    ref="menuRef"
    role="menu"
    class="no-drag term-group-menu absolute right-0 z-50 w-[150px] max-h-[min(300px,75vh)] overflow-y-auto oterm-scroll rounded-md border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] py-0.5 shadow-xl"
    :class="openUpward ? 'bottom-full mb-0.5' : 'top-full mt-0.5'"
    @mousedown.stop
    @scroll.stop
  >
    <template v-for="item in items" :key="item.id">
      <button
        type="button"
        role="menuitem"
        data-menu-item="true"
        class="flex w-full px-2 py-1 text-left text-[0.75rem] leading-[1.2] transition"
        :class="[
          item.destructive ? 'text-[#ff7b72]' : 'text-[var(--oterm-text)]',
          'hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--oterm-accent)] focus-visible:ring-inset',
        ]"
        @click="run(item.id)"
      >
        {{ item.label }}
      </button>
    </template>

    <div role="separator" class="my-0.5 border-t border-[var(--oterm-border)]" />

    <div
      role="radiogroup"
      aria-label="Group color"
      class="flex items-center justify-between px-2 py-1.5"
    >
      <button
        v-for="c in ENTRY_COLORS"
        :key="c.id"
        type="button"
        role="radio"
        class="term-color-swatch h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-offset-1 ring-offset-[var(--oterm-elevated)] transition focus:outline-none focus-visible:ring-[var(--oterm-text)]"
        :class="color === c.id ? 'ring-[var(--oterm-text)]' : 'ring-transparent'"
        :style="{ backgroundColor: c.hex }"
        :aria-checked="color === c.id"
        :aria-label="c.label"
        :title="c.label"
        @click="emit('colorChange', c.id)"
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
        :value="color !== 'none' && !ENTRY_COLORS.some(c => c.id === color) ? color : ''"
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
