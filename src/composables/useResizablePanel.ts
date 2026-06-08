import { onBeforeUnmount, onMounted, ref } from "vue";
import { getSetting, setSetting } from "../lib/settingsStore";

const STORAGE_KEY = "oterm:source-control-width";
const DEFAULT_WIDTH = 288;
const MIN_WIDTH = 240;
const MAX_VIEWPORT_RATIO = 0.8;

function loadWidth(): number {
  const raw = getSetting(STORAGE_KEY);
  if (!raw) return DEFAULT_WIDTH;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_WIDTH;
  return clampWidth(parsed);
}

function maxPanelWidth(): number {
  return Math.floor(window.innerWidth * MAX_VIEWPORT_RATIO);
}

function clampWidth(value: number): number {
  return Math.max(MIN_WIDTH, Math.min(maxPanelWidth(), value));
}

export function useResizablePanel(onResize?: () => void) {
  const widthPx = ref(loadWidth());
  const resizing = ref(false);

  function persistWidth() {
    void setSetting(STORAGE_KEY, String(widthPx.value));
  }

  let rafId = 0;
  function notifyResize() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      onResize?.();
    });
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    resizing.value = true;

    const startX = event.clientX;
    const startWidth = widthPx.value;

    function onPointerMove(moveEvent: PointerEvent) {
      widthPx.value = clampWidth(startWidth - (moveEvent.clientX - startX));
      notifyResize();
    }

    function onPointerUp() {
      resizing.value = false;
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      persistWidth();
      notifyResize();
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }

  function onWindowResize() {
    widthPx.value = clampWidth(widthPx.value);
    notifyResize();
  }

  onMounted(() => {
    widthPx.value = clampWidth(widthPx.value);
    window.addEventListener("resize", onWindowResize);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", onWindowResize);
  });

  return {
    widthPx,
    resizing,
    onResizeHandlePointerDown: onPointerDown,
  };
}
