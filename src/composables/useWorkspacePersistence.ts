import { getCurrentWindow } from "@tauri-apps/api/window";
import { onMounted, onUnmounted, watch, type Ref } from "vue";
import {
  EMPTY_TERMINAL_WORKSPACE,
  savePersistedTerminalWorkspace,
} from "../lib/workspaceStore";
import type { PersistedTerminalWorkspaceV1, WorkspaceTab } from "../types/terminal";

const DEBOUNCE_MS = 250;

export function useWorkspacePersistence(
  tabs: Ref<WorkspaceTab[]>,
  activeTabId: Ref<string | null>,
  activePaneId: Ref<string | null>,
  getSnapshot: () => PersistedTerminalWorkspaceV1 | null,
) {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let unlistenClose: (() => void) | undefined;
  let flushPromise: Promise<void> | undefined;

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

  onMounted(() => {
    watch([tabs, activeTabId, activePaneId], scheduleSave, { deep: true });

    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        try {
          await flush();
        } catch {
          // proceed with close even if persistence fails
        }
        await getCurrentWindow().close();
      })
      .then((unlisten) => {
        unlistenClose = unlisten;
      });

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
  });

  onUnmounted(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    unlistenClose?.();
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  });

  return { flush, scheduleSave };
}
