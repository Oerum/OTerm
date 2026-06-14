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

function resolveGroupDrop(clientY: number, listEl: HTMLElement): string | null | undefined {
  const nodes = listEl.querySelectorAll<HTMLElement>("[data-terminal-group-drop]");
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (clientY < rect.top || clientY > rect.bottom) continue;
    const raw = node.dataset.groupId ?? node.dataset.terminalGroupDrop ?? "";
    if (raw === "ungrouped" || raw === "null") return null;
    return raw;
  }
  return undefined;
}

function indexAfterGroup(
  entries: TerminalSidebarEntry[],
  groupId: string | null,
  excludeTabId: string,
): number {
  const tabs = entries.filter((entry) => entry.isFirstPaneOfTab && entry.tabId !== excludeTabId);
  let last = -1;
  for (let i = 0; i < tabs.length; i++) {
    if (tabs[i]!.groupId === groupId) last = i;
  }
  return last + 1;
}

export function useTerminalTabDragReorder(
  entriesRef: Ref<TerminalSidebarEntry[]>,
  onDrop: (tabId: string, toTerminalIndex: number, groupId?: string | null) => void,
) {
  const draggingTabId = ref<string | null>(null);
  const dropBeforeIndex = ref<number | null>(null);
  const dropGroupId = ref<string | null | undefined>(undefined);
  const dropOnGroupHeader = ref(false);

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
    dropGroupId.value = undefined;
    dropOnGroupHeader.value = false;

    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);

    const onMove = (e: PointerEvent) => {
      const groupTarget = resolveGroupDrop(e.clientY, listEl);
      if (groupTarget !== undefined) {
        dropGroupId.value = groupTarget;
        dropOnGroupHeader.value = true;
        dropBeforeIndex.value = indexAfterGroup(entriesRef.value, groupTarget, tabId);
        return;
      }
      dropGroupId.value = undefined;
      dropOnGroupHeader.value = false;
      dropBeforeIndex.value = resolveDropBeforeIndex(e.clientY, listEl);
    };

    const onEnd = (e: PointerEvent) => {
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);

      const beforeIndex = dropBeforeIndex.value;
      const explicitGroupId = dropGroupId.value;
      const onGroupHeader = dropOnGroupHeader.value;
      draggingTabId.value = null;
      dropBeforeIndex.value = null;
      dropGroupId.value = undefined;
      dropOnGroupHeader.value = false;

      if (beforeIndex == null || draggedTerminalIndex < 0) {
        draggedTerminalIndex = -1;
        return;
      }

      const tabCount = terminalTabCount();
      let targetIndex = beforeIndex;
      if (targetIndex > draggedTerminalIndex) targetIndex -= 1;

      if (onGroupHeader && explicitGroupId !== undefined) {
        onDrop(tabId, Math.max(0, Math.min(targetIndex, tabCount)), explicitGroupId);
      } else if (
        targetIndex !== draggedTerminalIndex &&
        targetIndex >= 0 &&
        targetIndex < tabCount
      ) {
        onDrop(tabId, targetIndex, explicitGroupId);
      }
      draggedTerminalIndex = -1;
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
  }

  function terminalTabCount() {
    return entriesRef.value.filter((e) => e.isFirstPaneOfTab).length;
  }

  function isDropTarget(entry: TerminalSidebarEntry) {
    return (
      dropBeforeIndex.value != null &&
      !dropOnGroupHeader.value &&
      entry.isFirstPaneOfTab &&
      entry.terminalTabIndex === dropBeforeIndex.value
    );
  }

  function isDropTargetAfter(entry: TerminalSidebarEntry) {
    const beforeIndex = dropBeforeIndex.value;
    const tabCount = terminalTabCount();
    return (
      beforeIndex != null &&
      !dropOnGroupHeader.value &&
      beforeIndex === tabCount &&
      entry.isFirstPaneOfTab &&
      entry.terminalTabIndex === tabCount - 1
    );
  }

  function isGroupDropTarget(groupId: string | null) {
    return dropOnGroupHeader.value && dropGroupId.value === groupId;
  }

  function isDraggingTab(entry: TerminalSidebarEntry) {
    return draggingTabId.value === entry.tabId;
  }

  return {
    draggingTabId,
    dropBeforeIndex,
    onDragPointerDown,
    isDropTarget,
    isDropTargetAfter,
    isGroupDropTarget,
    isDraggingTab,
  };
}
