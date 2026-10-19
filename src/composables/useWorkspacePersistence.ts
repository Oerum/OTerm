import { getCurrentWindow } from "@tauri-apps/api/window";
import { onMounted, onUnmounted, watch, type WatchStopHandle } from "vue";
import {
  EMPTY_TERMINAL_WORKSPACE,
  savePersistedTerminalWorkspace,
} from "../lib/workspaceStore";
import type { PersistedTerminalWorkspaceV2 } from "../types/terminal";

const DEBOUNCE_MS = 250;
const FLUSH_TIMEOUT_MS = 2000;
const BEFORE_DESTROY_TIMEOUT_MS = 3000;

type WorkspacePersistenceOptions = {
  beforeDestroy?: () => Promise<void>;
};

export function useWorkspacePersistence(
  getSnapshot: () => PersistedTerminalWorkspaceV2 | null,
  options: WorkspacePersistenceOptions = {},
) {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let unlistenClose: (() => void) | undefined;
  let flushPromise: Promise<void> | undefined;
  let isClosing = false;
  let unmounted = false;
  let stopWatching: WatchStopHandle | undefined;

  async function flush() {
    if (flushPromise) return flushPromise;

    flushPromise = (async () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
      const snapshot = getSnapshot();
      await savePersistedTerminalWorkspace(snapshot ?? EMPTY_TERMINAL_WORKSPACE);
    })().finally(() => {
      flushPromise = undefined;
    });

    return flushPromise;
  }

  function scheduleSave() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void flush();
    }, DEBOUNCE_MS);
  }

  function onPageHide() {
    void flush();
  }

  function onVisibilityChange() {
    if (document.visibilityState === "hidden") void flush();
  }

  async function destroyWindow() {
    const window = getCurrentWindow();
    try {
      await window.destroy();
    } catch (error) {
      console.error("oterm: failed to destroy window", error);
      try {
        await window.close();
      } catch (closeError) {
        console.error("oterm: failed to close window", closeError);
        isClosing = false;
      }
    }
  }

  onMounted(() => {
    stopWatching = watch(getSnapshot, scheduleSave);

    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        if (isClosing) {
          await destroyWindow();
          return;
        }
        isClosing = true;
        try {
          await Promise.race([
            flush(),
            new Promise<void>((resolve) => window.setTimeout(resolve, FLUSH_TIMEOUT_MS)),
          ]);
        } catch {
          // proceed with close even if persistence fails
        }
        if (options.beforeDestroy) {
          try {
            await Promise.race([
              options.beforeDestroy(),
              new Promise<void>((resolve) =>
                window.setTimeout(resolve, BEFORE_DESTROY_TIMEOUT_MS),
              ),
            ]);
          } catch {
            // proceed with close even if session cleanup fails
          }
        }
        await destroyWindow();
      })
      .then((unlisten) => {
        if (unmounted) unlisten();
        else unlistenClose = unlisten;
      })
      .catch((error) => {
        console.error("oterm: failed to register close handler", error);
      });

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
  });

  onUnmounted(() => {
    unmounted = true;
    stopWatching?.();
    if (debounceTimer) clearTimeout(debounceTimer);
    unlistenClose?.();
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  });

  return { flush, scheduleSave, isClosing: () => isClosing };
}
