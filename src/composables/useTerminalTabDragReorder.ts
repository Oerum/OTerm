import { ref, type Ref } from "vue";
import type { TerminalSidebarEntry } from "../types/terminal";

const DRAG_THRESHOLD_PX = 4;

const TERMINAL_ROW_DRAG_BLOCK_SELECTOR =
  "button, input, textarea, [data-terminal-entry-actions], .term-entry-menu";

export function isTerminalRowDragBlocked(target: Element): boolean {
  return !!target.closest(TERMINAL_ROW_DRAG_BLOCK_SELECTOR);
}

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
  return [...groups.entries()].sort((a, b) => a[1].top - b[1].top);
}

export function resolveDropBeforeIndex(clientY: number, listEl: HTMLElement): number | null {
  const bounds = getTabGroupBounds(listEl);
  if (!bounds.length) return null;
  for (const [index, group] of bounds) {
    const mid = (group.top + group.bottom) / 2;
    if (clientY < mid) return index;
  }
  return bounds[bounds.length - 1]![0] + 1;
}

export function parseGroupSectionId(raw: string): string | null {
  if (raw === "ungrouped" || raw === "null" || raw === "") return null;
  return raw;
}

export function resolveGroupSection(clientY: number, listEl: HTMLElement): string | null | undefined {
  const nodes = listEl.querySelectorAll<HTMLElement>("[data-terminal-group-section]");
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (clientY < rect.top || clientY > rect.bottom) continue;
    return parseGroupSectionId(node.dataset.terminalGroupSection ?? "");
  }
  return undefined;
}

export function resolveGroupHeader(clientY: number, listEl: HTMLElement): boolean {
  const nodes = listEl.querySelectorAll<HTMLElement>("[data-terminal-group-drop]");
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) return true;
  }
  return false;
}

function indexBeforeGroup(
  entries: TerminalSidebarEntry[],
  groupId: string | null,
  excludeTabId: string,
): number {
  const tabs = entries.filter((entry) => entry.isFirstPaneOfTab && entry.tabId !== excludeTabId);
  for (let i = 0; i < tabs.length; i++) {
    if (tabs[i]!.groupId === groupId) return i;
  }
  return tabs.length;
}

export function useTerminalTabDragReorder(
  entriesRef: Ref<TerminalSidebarEntry[]>,
  onDrop: (tabId: string, toTerminalIndex: number, groupId?: string | null) => void,
) {
  const draggingTabId = ref<string | null>(null);
  const dropBeforeIndex = ref<number | null>(null);
  const dropGroupId = ref<string | null | undefined>(undefined);
  const dropInGroupSection = ref(false);
  const dropShowsInsertLine = ref(true);

  let draggedTerminalIndex = -1;

  function updateDropState(clientY: number, listEl: HTMLElement, tabId: string) {
    const beforeIndex = resolveDropBeforeIndex(clientY, listEl);
    const sectionGroupId = resolveGroupSection(clientY, listEl);

    if (sectionGroupId !== undefined) {
      dropGroupId.value = sectionGroupId;
      dropInGroupSection.value = true;
      const overHeader = resolveGroupHeader(clientY, listEl);
      if (beforeIndex == null || overHeader) {
        dropBeforeIndex.value = indexBeforeGroup(entriesRef.value, sectionGroupId, tabId);
        dropShowsInsertLine.value = false;
      } else {
        dropBeforeIndex.value = beforeIndex;
        dropShowsInsertLine.value = true;
      }
      return;
    }

    dropGroupId.value = undefined;
    dropInGroupSection.value = false;
    dropShowsInsertLine.value = true;
    dropBeforeIndex.value = beforeIndex;
  }

  function onDragPointerDown(
    tabId: string,
    terminalTabIndex: number,
    event: PointerEvent,
    listEl: HTMLElement | null,
    handleEl: HTMLElement | null,
  ) {
    if (event.button !== 0 || !listEl || !handleEl) return;

    const handle = handleEl;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    let active = false;

    const onMove = (e: PointerEvent) => {
      if (!active) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD_PX) return;
        active = true;
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(pointerId);
        draggingTabId.value = tabId;
        draggedTerminalIndex = terminalTabIndex;
        dropBeforeIndex.value = terminalTabIndex;
        dropGroupId.value = undefined;
        dropInGroupSection.value = false;
        dropShowsInsertLine.value = true;
      }
      updateDropState(e.clientY, listEl, tabId);
    };

    const onEnd = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);

      if (!active) {
        draggedTerminalIndex = -1;
        return;
      }

      if (handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }

      const beforeIndex = dropBeforeIndex.value;
      const explicitGroupId = dropGroupId.value;
      draggingTabId.value = null;
      dropBeforeIndex.value = null;
      dropGroupId.value = undefined;
      dropInGroupSection.value = false;
      dropShowsInsertLine.value = true;

      if (beforeIndex == null || draggedTerminalIndex < 0) {
        draggedTerminalIndex = -1;
        return;
      }

      const tabCount = terminalTabCount();
      let targetIndex = beforeIndex;
      if (targetIndex > draggedTerminalIndex) targetIndex -= 1;

      const moved =
        targetIndex !== draggedTerminalIndex && targetIndex >= 0 && targetIndex < tabCount;
      const currentGroupId =
        entriesRef.value.find((entry) => entry.tabId === tabId && entry.isFirstPaneOfTab)?.groupId ??
        null;
      const groupChanged = explicitGroupId !== undefined && explicitGroupId !== currentGroupId;

      if (explicitGroupId !== undefined && (moved || groupChanged)) {
        onDrop(tabId, Math.max(0, Math.min(targetIndex, tabCount)), explicitGroupId);
      } else if (moved) {
        onDrop(tabId, targetIndex, undefined);
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
      dropShowsInsertLine.value &&
      entry.isFirstPaneOfTab &&
      entry.terminalTabIndex === dropBeforeIndex.value
    );
  }

  function isDropTargetAfter(entry: TerminalSidebarEntry) {
    const beforeIndex = dropBeforeIndex.value;
    const tabCount = terminalTabCount();
    return (
      beforeIndex != null &&
      dropShowsInsertLine.value &&
      beforeIndex === tabCount &&
      entry.isFirstPaneOfTab &&
      entry.terminalTabIndex === tabCount - 1
    );
  }

  function isGroupDropTarget(groupId: string | null) {
    return dropInGroupSection.value && dropGroupId.value === groupId;
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
