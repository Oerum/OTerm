import { onMounted, onUnmounted, type Ref } from "vue";

/** Close when clicking outside any of `roots`, or pressing Escape while open. */
export function useOutsideDismiss(
  getOpen: () => boolean,
  onClose: () => void,
  roots: Array<Ref<HTMLElement | null>>,
) {
  function onDocumentMouseDown(event: MouseEvent) {
    if (!getOpen()) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (roots.some((root) => root.value?.contains(target))) return;
    onClose();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!getOpen()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  onMounted(() => {
    document.addEventListener("mousedown", onDocumentMouseDown);
    window.addEventListener("keydown", onKeyDown);
  });

  onUnmounted(() => {
    document.removeEventListener("mousedown", onDocumentMouseDown);
    window.removeEventListener("keydown", onKeyDown);
  });
}
