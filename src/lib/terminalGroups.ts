import type { TerminalTabGroup, WorkspaceTerminalTab } from "../types/terminal";
import { isTerminalTab, type WorkspaceTab } from "../types/terminal";

export function sortGroups(groups: TerminalTabGroup[]): TerminalTabGroup[] {
  return [...groups].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function terminalTabsFrom(tabs: WorkspaceTab[]): WorkspaceTerminalTab[] {
  return tabs.filter(isTerminalTab);
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

export function sanitizeTabGroupIds(
  groups: TerminalTabGroup[],
  tabs: WorkspaceTerminalTab[],
): WorkspaceTerminalTab[] {
  const validIds = new Set(groups.map((group) => group.id));
  for (const tab of tabs) {
    if (tab.groupId && !validIds.has(tab.groupId)) {
      tab.groupId = null;
    }
  }
  return tabs;
}

export function nextGroupOrder(groups: TerminalTabGroup[]): number {
  if (groups.length === 0) return 0;
  return Math.max(...groups.map((group) => group.order)) + 1;
}
