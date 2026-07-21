import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { filterCommandPaletteItems } from "../lib/commandPaletteFuzzy";
import type { CommandPaletteItem } from "../lib/commandPaletteItems";

export function clampActiveIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

export function useCommandPalette(
  items: Ref<CommandPaletteItem[]> | ComputedRef<CommandPaletteItem[]>,
) {
  const open = ref(false);
  const query = ref("");
  const activeIndex = ref(0);

  const filtered = computed(() => filterCommandPaletteItems(query.value, items.value));

  const activeItem = computed(() => filtered.value[activeIndex.value] ?? null);

  watch(filtered, (list) => {
    activeIndex.value = clampActiveIndex(activeIndex.value, list.length);
  });

  function openPalette(opts?: { initialQuery?: string }) {
    query.value = opts?.initialQuery ?? "";
    activeIndex.value = 0;
    open.value = true;
  }

  function closePalette() {
    open.value = false;
    query.value = "";
    activeIndex.value = 0;
  }

  function moveActive(delta: number) {
    const len = filtered.value.length;
    if (len <= 0) return;
    activeIndex.value = clampActiveIndex(activeIndex.value + delta, len);
  }

  function setActiveIndex(index: number) {
    activeIndex.value = clampActiveIndex(index, filtered.value.length);
  }

  return {
    open,
    query,
    activeIndex,
    filtered,
    activeItem,
    openPalette,
    closePalette,
    moveActive,
    setActiveIndex,
  };
}
