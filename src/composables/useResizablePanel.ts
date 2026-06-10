import { onBeforeUnmount, onMounted, ref } from "vue";
import { getSetting, setSetting } from "../lib/settingsStore";

const STORAGE_KEY = "oterm:source-control-width";
const FILE_LIST_STORAGE_KEY = "oterm:sc-file-list-width";
export const SOURCE_CONTROL_FILE_LIST_WIDTH = 280;
export const SOURCE_CONTROL_FILE_LIST_MIN_WIDTH = 220;
export const SOURCE_CONTROL_DIFF_PANE_MIN_WIDTH = 480;
const SOURCE_CONTROL_DEFAULT_WIDTH = 720;

const DEFAULT_WIDTH = SOURCE_CONTROL_DEFAULT_WIDTH;
const MIN_WIDTH = 240;
const MAX_VIEWPORT_RATIO = 0.8;

function loadWidth(): number {
  const raw = getSetting(STORAGE_KEY);
  if (!raw) return DEFAULT_WIDTH;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_WIDTH;
  return clampWidth(parsed);
}

function loadFileListWidth(): number {
  const raw = getSetting(FILE_LIST_STORAGE_KEY);
  if (!raw) return SOURCE_CONTROL_FILE_LIST_WIDTH;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return SOURCE_CONTROL_FILE_LIST_WIDTH;
  return clampFileListWidth(parsed, maxPanelWidth());
}

function maxPanelWidth(): number {
  return Math.floor(window.innerWidth * MAX_VIEWPORT_RATIO);
}

function clampWidth(value: number): number {
  return Math.max(MIN_WIDTH, Math.min(maxPanelWidth(), value));
}

function clampFileListWidth(value: number, panelWidth: number): number {
  const maxFileList = Math.max(
    SOURCE_CONTROL_FILE_LIST_MIN_WIDTH,
    panelWidth - SOURCE_CONTROL_DIFF_PANE_MIN_WIDTH,
  );
  return Math.max(
    SOURCE_CONTROL_FILE_LIST_MIN_WIDTH,
    Math.min(maxFileList, value),
  );
}

export function useResizablePanel(onResize?: () => void) {
  const widthPx = ref(loadWidth());
  const fileListWidthPx = ref(loadFileListWidth());
  const resizing = ref(false);
  let userResizedThisSession = false;

  function persistWidth() {
    void setSetting(STORAGE_KEY, String(widthPx.value));
  }

  function persistFileListWidth() {
    void setSetting(FILE_LIST_STORAGE_KEY, String(fileListWidthPx.value));
  }

  function minExpandWidth() {
    return fileListWidthPx.value + SOURCE_CONTROL_DIFF_PANE_MIN_WIDTH;
  }

  let rafId = 0;
  function notifyResize() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      onResize?.();
    });
  }

  function ensureDiffPaneWidth() {
    if (userResizedThisSession) return;
    const needed = minExpandWidth();
    if (widthPx.value >= needed) return;
    widthPx.value = clampWidth(needed);
    persistWidth();
    notifyResize();
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    resizing.value = true;

    const startX = event.clientX;
    const startWidth = widthPx.value;

    function onPointerMove(moveEvent: PointerEvent) {
      const next = clampWidth(startWidth - (moveEvent.clientX - startX));
      if (next !== widthPx.value) {
        userResizedThisSession = true;
      }
      widthPx.value = next;
      fileListWidthPx.value = clampFileListWidth(fileListWidthPx.value, widthPx.value);
      notifyResize();
    }

    function onPointerUp() {
      resizing.value = false;
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      persistWidth();
      persistFileListWidth();
      notifyResize();
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }

  function onFileListResizePointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = fileListWidthPx.value;

    function onPointerMove(moveEvent: PointerEvent) {
      const next = clampFileListWidth(
        startWidth + (moveEvent.clientX - startX),
        widthPx.value,
      );
      if (next !== fileListWidthPx.value) {
        fileListWidthPx.value = next;
        notifyResize();
      }
    }

    function onPointerUp() {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      persistFileListWidth();
      notifyResize();
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }

  function setFileListWidth(value: number) {
    const next = clampFileListWidth(value, widthPx.value);
    if (next === fileListWidthPx.value) return;
    fileListWidthPx.value = next;
    persistFileListWidth();
    notifyResize();
  }

  function onWindowResize() {
    widthPx.value = clampWidth(widthPx.value);
    fileListWidthPx.value = clampFileListWidth(fileListWidthPx.value, widthPx.value);
    notifyResize();
  }

  onMounted(() => {
    widthPx.value = clampWidth(widthPx.value);
    fileListWidthPx.value = clampFileListWidth(fileListWidthPx.value, widthPx.value);
    window.addEventListener("resize", onWindowResize);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", onWindowResize);
  });

  return {
    widthPx,
    fileListWidthPx,
    resizing,
    ensureDiffPaneWidth,
    onResizeHandlePointerDown: onPointerDown,
    onFileListResizePointerDown,
    setFileListWidth,
  };
}
