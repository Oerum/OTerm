import { nextTick, onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import { handleMenuKeyDown } from "../lib/menuKeyboardNav";

export function useMenuKeyboardNav<T extends { id: string; disabled?: boolean }>(options: {
  menuRef: Ref<HTMLElement | null>;
  getOpen: () => boolean;
  getEnabledIndices: () => number[];
  getItems: () => T[];
  onClose: () => void;
  onRun: (id: string) => void;
  /** When the menu opens, focus first enabled item (default) or index 0. */
  initialFocus?: "first-enabled" | "zero";
}) {
  const focusIndex = ref(0);
  const initialFocus = options.initialFocus ?? "first-enabled";

  function focusItem(index: number) {
    nextTick(() => {
      options.menuRef.value
        ?.querySelectorAll<HTMLButtonElement>('[data-menu-item="true"]')
        [index]?.focus();
    });
  }

  function onKeyDown(event: KeyboardEvent) {
    handleMenuKeyDown(event, {
      open: options.getOpen(),
      enabledIndices: options.getEnabledIndices(),
      focusIndex: focusIndex.value,
      items: options.getItems(),
      onClose: options.onClose,
      onFocus: (next) => {
        focusIndex.value = next;
        focusItem(next);
      },
      onRun: options.onRun,
    });
  }

  watch(options.getOpen, (open) => {
    if (!open) return;
    const first =
      initialFocus === "zero" ? 0 : (options.getEnabledIndices()[0] ?? 0);
    focusIndex.value = first;
    nextTick(() => focusItem(first));
  });

  onMounted(() => window.addEventListener("keydown", onKeyDown));
  onUnmounted(() => window.removeEventListener("keydown", onKeyDown));

  return { focusIndex, focusItem };
}
