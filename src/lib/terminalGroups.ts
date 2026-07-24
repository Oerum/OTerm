import type { TerminalTabGroup, WorkspaceTerminalTab } from "../types/terminal";
import { isTerminalTab, type WorkspaceTab } from "../types/terminal";

export function sortGroups(groups: TerminalTabGroup[]): TerminalTabGroup[] {
  return [...groups].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function tabsInGroup(
  terminalTabs: WorkspaceTerminalTab[],
  groupId: string | null,
): WorkspaceTerminalTab[] {
  return terminalTabs.filter((tab) => tab.groupId === groupId);
}

export function ungroupedTabs(terminalTabs: WorkspaceTerminalTab[]): WorkspaceTerminalTab[] {
  return tabsInGroup(terminalTabs, null);
}

export function nextGroupOrder(groups: TerminalTabGroup[]): number {
  if (groups.length === 0) return 0;
  return Math.max(...groups.map((group) => group.order)) + 1;
}

export function isWorkspaceTabCyclable(
  tab: WorkspaceTab,
  collapsedGroupIds: readonly string[],
): boolean {
  if (!isTerminalTab(tab)) return true;
  if (!tab.groupId) return true;
  return !collapsedGroupIds.includes(tab.groupId);
}

export function findNextCyclableTabId(
  tabs: readonly WorkspaceTab[],
  activeTabId: string | null,
  direction: 1 | -1,
  collapsedGroupIds: readonly string[],
): string | null {
  if (tabs.length <= 1) return null;

  const currentIndex = activeTabId
    ? tabs.findIndex((tab) => tab.id === activeTabId)
    : -1;
  const startIndex = currentIndex === -1 ? 0 : currentIndex;

  for (let step = 1; step <= tabs.length; step++) {
    const index = (startIndex + direction * step + tabs.length) % tabs.length;
    const tab = tabs[index];
    if (!tab || !isWorkspaceTabCyclable(tab, collapsedGroupIds)) continue;
    if (tab.id === activeTabId) return null;
    return tab.id;
  }

  return null;
}
