import { ref, type Ref } from "vue";
import type { TerminalSidebarEntry } from "../types/terminal";

function getTabGroupBounds(listEl: HTMLElement) {
  const groups = new Map<number, { top: number; bottom: number }>();
  const nodes = listEl.querySelectorAll<HTMLElement>("[data-terminal-tab-index]");
  for (const node of nodes) {
    const idx = Number.parseInt(node.dataset.terminalTabIndex ?? "", 10);
    if (!Number.isFinite(idx)) continue;
    const rect = node.getBoundingClientRect();
    const existing = groups.get(idx);
    if (existing) {
      existing.top = Math.min(existing.top, rect.top);
      existing.bottom = Math.max(existing.bottom, rect.bottom);
    } else {
      groups.set(idx, { top: rect.top, bottom: rect.bottom });
    }
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]);
}

function resolveDropBeforeIndex(clientY: number, listEl: HTMLElement): number | null {
  const bounds = getTabGroupBounds(listEl);
  if (!bounds.length) return null;
  for (const [index, group] of bounds) {
    const mid = (group.top + group.bottom) / 2;
    if (clientY < mid) return index;
  }
  return bounds[bounds.length - 1]![0] + 1;
}

export function useTerminalTabDragReorder(
  entriesRef: Ref<TerminalSidebarEntry[]>,
  onReorder: (tabId: string, toTerminalIndex: number) => void,
) {
  const draggingTabId = ref<string | null>(null);
  const dropBeforeIndex = ref<number | null>(null);

  let draggedTerminalIndex = -1;

  function onDragPointerDown(
    tabId: string,
    terminalTabIndex: number,
    event: PointerEvent,
    listEl: HTMLElement | null,
  ) {
    if (event.button !== 0 || !listEl) return;
    event.preventDefault();
    event.stopPropagation();

    draggingTabId.value = tabId;
    draggedTerminalIndex = terminalTabIndex;
    dropBeforeIndex.value = terminalTabIndex;

    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);

    const onMove = (e: PointerEvent) => {
      dropBeforeIndex.value = resolveDropBeforeIndex(e.clientY, listEl);
    };

    const onEnd = (e: PointerEvent) => {
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);

      const beforeIndex = dropBeforeIndex.value;
      draggingTabId.value = null;
      dropBeforeIndex.value = null;

      if (beforeIndex == null || draggedTerminalIndex < 0) {
        draggedTerminalIndex = -1;
        return;
      }

      let targetIndex = beforeIndex;
      if (targetIndex > draggedTerminalIndex) targetIndex -= 1;
      if (
        targetIndex !== draggedTerminalIndex &&
        targetIndex >= 0 &&
        targetIndex < entriesRef.value.filter((e) => e.isFirstPaneOfTab).length
      ) {
        onReorder(tabId, targetIndex);
      }
      draggedTerminalIndex = -1;
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
  }

  function isDropTarget(entry: TerminalSidebarEntry) {
    return (
      dropBeforeIndex.value != null &&
      entry.isFirstPaneOfTab &&
      entry.terminalTabIndex === dropBeforeIndex.value
    );
  }

  function isDraggingTab(entry: TerminalSidebarEntry) {
    return draggingTabId.value === entry.tabId;
  }

  return {
    draggingTabId,
    dropBeforeIndex,
    onDragPointerDown,
    isDropTarget,
    isDraggingTab,
  };
}
