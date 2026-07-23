import { onMounted, onUnmounted, watch } from "vue";

export function useDialogEscapeFocus(
  getOpen: () => boolean,
  onCancel: () => void,
  focusId?: string,
) {
  function onKeyDown(event: KeyboardEvent) {
    if (!getOpen()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  if (focusId) {
    watch(getOpen, (isOpen) => {
      if (!isOpen) return;
      window.setTimeout(() => {
        document.getElementById(focusId)?.focus();
      }, 0);
    });
  }

  onMounted(() => window.addEventListener("keydown", onKeyDown));
  onUnmounted(() => window.removeEventListener("keydown", onKeyDown));
}

export function useDialogKeyNav(
  getOpen: () => boolean,
  onCancel: () => void,
  onOpen?: () => void | Promise<void>,
) {
  function onKeyDown(event: KeyboardEvent) {
    if (!getOpen()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  watch(
    getOpen,
    async (isOpen) => {
      if (isOpen) {
        window.addEventListener("keydown", onKeyDown);
        if (onOpen) await onOpen();
      } else {
        window.removeEventListener("keydown", onKeyDown);
      }
    },
    { immediate: true },
  );

  onUnmounted(() => window.removeEventListener("keydown", onKeyDown));
}
