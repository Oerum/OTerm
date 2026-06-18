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

function getVisualTabs(listEl: HTMLElement) {
  const nodes = listEl.querySelectorAll<HTMLElement>("[data-terminal-tab-id]");
  const tabs: Array<{ tabId: string; rect: DOMRect }> = [];
  const seenIds = new Set<string>();
  for (const node of nodes) {
    const tabId = node.dataset.terminalTabId;
    if (!tabId || seenIds.has(tabId)) continue;
    seenIds.add(tabId);
    tabs.push({
      tabId,
      rect: node.getBoundingClientRect(),
    });
  }
  return tabs.sort((a, b) => a.rect.top - b.rect.top);
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

  // Smooth drag calculations
  const draggedHeight = ref<number>(0);
  const dragDisplacementX = ref<number>(0);
  const dragDisplacementY = ref<number>(0);
  const draggedTerminalIndex = ref<number>(-1);
  const dropVisualTargetIndex = ref<number | null>(null);

  // Cached geometry data to prevent layout calculations during active dragging
  interface CachedGroupSection {
    groupId: string | null;
    rect: DOMRect;
  }

  interface CachedVisualTab {
    tabId: string;
    top: number;
    bottom: number;
    height: number;
  }

  let cachedBounds: Array<[number, { top: number; bottom: number }]> = [];
  let cachedGroupSections: CachedGroupSection[] = [];
  let cachedGroupHeaders: DOMRect[] = [];
  let cachedVisualTabs: CachedVisualTab[] = [];

  function resolveVisualTargetIndex(adjustedClientY: number): number {
    if (!cachedVisualTabs.length) return 0;
    for (let i = 0; i < cachedVisualTabs.length; i++) {
      const tab = cachedVisualTabs[i];
      const mid = (tab.top + tab.bottom) / 2;
      if (adjustedClientY < mid) {
        return i;
      }
    }
    return cachedVisualTabs.length;
  }

  function resolveDropBeforeIndexCached(adjustedClientY: number): number | null {
    if (!cachedBounds.length) return null;
    for (const [index, group] of cachedBounds) {
      const mid = (group.top + group.bottom) / 2;
      if (adjustedClientY < mid) return index;
    }
    return cachedBounds[cachedBounds.length - 1]![0] + 1;
  }

  function resolveGroupSectionCached(adjustedClientY: number): string | null | undefined {
    for (const item of cachedGroupSections) {
      if (adjustedClientY >= item.rect.top && adjustedClientY <= item.rect.bottom) {
        return item.groupId;
      }
    }
    return undefined;
  }

  function resolveGroupHeaderCached(adjustedClientY: number): boolean {
    for (const rect of cachedGroupHeaders) {
      if (adjustedClientY >= rect.top && adjustedClientY <= rect.bottom) {
        return true;
      }
    }
    return false;
  }


  function updateDropStateCached(adjustedClientY: number, tabId: string) {
    const beforeIndex = resolveDropBeforeIndexCached(adjustedClientY);
    const sectionGroupId = resolveGroupSectionCached(adjustedClientY);

    // Track visual target index in the visible list for anim shifting
    dropVisualTargetIndex.value = resolveVisualTargetIndex(adjustedClientY);

    if (sectionGroupId !== undefined) {
      dropGroupId.value = sectionGroupId;
      dropInGroupSection.value = true;
      const overHeader = resolveGroupHeaderCached(adjustedClientY);
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
    let startScrollTop = listEl.scrollTop;

    const onMove = (e: PointerEvent) => {
      if (!active) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD_PX) return;
        active = true;
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(pointerId);
        draggingTabId.value = tabId;
        draggedTerminalIndex.value = terminalTabIndex;

        // Measure all split panes belonging to this tab for correct visual shift height
        const paneNodes = listEl.querySelectorAll<HTMLElement>(`[data-terminal-tab-id="${tabId}"]`);
        let totalHeight = 0;
        for (const node of paneNodes) {
          totalHeight += node.getBoundingClientRect().height + 4; // height + gap-1 (4px)
        }
        draggedHeight.value = totalHeight;

        // Cache positions at drag start to eliminate layout calculations and jitter
        startScrollTop = listEl.scrollTop;
        cachedBounds = getTabGroupBounds(listEl);

        cachedGroupSections = [];
        const sectionNodes = listEl.querySelectorAll<HTMLElement>(`[data-terminal-group-section]`);
        for (const node of sectionNodes) {
          cachedGroupSections.push({
            groupId: parseGroupSectionId(node.dataset.terminalGroupSection ?? ""),
            rect: node.getBoundingClientRect(),
          });
        }

        cachedGroupHeaders = [];
        const headerNodes = listEl.querySelectorAll<HTMLElement>("[data-terminal-group-drop]");
        for (const node of headerNodes) {
          cachedGroupHeaders.push(node.getBoundingClientRect());
        }

        cachedVisualTabs = getVisualTabs(listEl).map((t) => ({
          tabId: t.tabId,
          top: t.rect.top,
          bottom: t.rect.bottom,
          height: t.rect.height,
        }));

        dropBeforeIndex.value = terminalTabIndex;
        dropGroupId.value = undefined;
        dropInGroupSection.value = false;
        dropShowsInsertLine.value = true;
        dropVisualTargetIndex.value = cachedVisualTabs.findIndex((t) => t.tabId === tabId);
      }

      const currentScrollDiff = listEl.scrollTop - startScrollTop;
      const adjustedClientY = e.clientY + currentScrollDiff;

      dragDisplacementX.value = e.clientX - startX;
      dragDisplacementY.value = e.clientY - startY;

      updateDropStateCached(adjustedClientY, tabId);
    };

    const onEnd = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);

      if (!active) {
        draggedTerminalIndex.value = -1;
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
      draggedTerminalIndex.value = -1;
      dragDisplacementX.value = 0;
      dragDisplacementY.value = 0;
      draggedHeight.value = 0;
      dropVisualTargetIndex.value = null;

      cachedBounds = [];
      cachedGroupSections = [];
      cachedGroupHeaders = [];
      cachedVisualTabs = [];

      if (beforeIndex == null || terminalTabIndex < 0) {
        return;
      }

      const tabCount = terminalTabCount();
      let targetIndex = beforeIndex;
      if (targetIndex > terminalTabIndex) targetIndex -= 1;

      const moved =
        targetIndex !== terminalTabIndex && targetIndex >= 0 && targetIndex < tabCount;
      const currentGroupId =
        entriesRef.value.find((entry) => entry.tabId === tabId && entry.isFirstPaneOfTab)?.groupId ??
        null;
      const groupChanged = explicitGroupId !== undefined && explicitGroupId !== currentGroupId;

      if (explicitGroupId !== undefined && (moved || groupChanged)) {
        onDrop(tabId, Math.max(0, Math.min(targetIndex, tabCount)), explicitGroupId);
      } else if (moved) {
        onDrop(tabId, targetIndex, undefined);
      }
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

  function getEntryDragStyle(entry: TerminalSidebarEntry) {
    if (draggingTabId.value === null) return undefined;

    // Dragged entry style: lifted, follow pointer with shadow, no transitions
    if (entry.tabId === draggingTabId.value) {
      return {
        transform: `translate3d(${dragDisplacementX.value}px, ${dragDisplacementY.value}px, 0) scale(1.02)`,
        zIndex: 50,
        pointerEvents: "none" as const,
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4)",
        transition: "none",
      };
    }

    // Other entries style: shift up or down to make a gap
    if (
      dropBeforeIndex.value === null ||
      draggedTerminalIndex.value === -1 ||
      !cachedVisualTabs.length ||
      dropVisualTargetIndex.value === null
    ) {
      return undefined;
    }

    const from = cachedVisualTabs.findIndex((t) => t.tabId === draggingTabId.value);
    if (from === -1) return undefined;

    const visualIndex = cachedVisualTabs.findIndex((t) => t.tabId === entry.tabId);
    if (visualIndex === -1) return undefined;

    const target = dropVisualTargetIndex.value;
    const H = draggedHeight.value;

    let shiftY = 0;
    if (from < target) {
      if (visualIndex > from && visualIndex < target) {
        shiftY = -H;
      }
    } else if (from > target) {
      if (visualIndex >= target && visualIndex < from) {
        shiftY = H;
      }
    }

    if (shiftY !== 0) {
      return {
        transform: `translate3d(0, ${shiftY}px, 0)`,
        transition: "transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)",
      };
    }

    return {
      transform: "translate3d(0, 0, 0)",
      transition: "transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)",
    };
  }

  return {
    draggingTabId,
    dropBeforeIndex,
    onDragPointerDown,
    isDropTarget,
    isDropTargetAfter,
    isGroupDropTarget,
    isDraggingTab,
    getEntryDragStyle,
  };
}
