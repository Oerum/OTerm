import type {
  FeatureSidebarEntry,
  ShellProfile,
  TerminalSidebarEntry,
  TerminalSidebarSection,
  TerminalEntryColor,
  TerminalTabGroup,
  WorkspaceTab,
  WorkspaceTerminalTab,
} from "../types/terminal";
import { isTerminalTab } from "../types/terminal";
import { getCliAgentDefinition, type CliAgentId } from "./terminalAgentMode";
import { sortGroups, tabsInGroup, ungroupedTabs } from "./terminalGroups";

export const ENTRY_COLORS = [
  { id: "none" as const, hex: "#5c5c5c", label: "None" },
  { id: "green" as const, hex: "#3dd68c", label: "Green" },
  { id: "blue" as const, hex: "#58a6ff", label: "Blue" },
  { id: "yellow" as const, hex: "#e3b341", label: "Yellow" },
  { id: "purple" as const, hex: "#bc8cff", label: "Purple" },
  { id: "pink" as const, hex: "#ff7eb6", label: "Pink" },
];

export function entryAccentColor(color: WorkspaceTerminalTab["color"]) {
  const match = ENTRY_COLORS.find((item) => item.id === color);
  if (match) return match.hex;
  return color && color !== "none" ? color : ENTRY_COLORS[0].hex;
}

export function shellLabelFor(shells: ShellProfile[], shellId: string) {
  return shells.find((shell) => shell.id === shellId)?.label ?? "Terminal";
}

export function paneDisplayTitle(
  pane: WorkspaceTerminalTab["panes"][number],
  shellLabel: string,
  splitIndex: number | null,
) {
  if (pane.customTitle?.trim()) return pane.customTitle.trim();
  // Agent brand/OSC belong in radar subtitle + badge — title stays project/cwd.
  const cwd = pane.cwd;
  let title = shellLabel;
  if (cwd && cwd !== "~") {
    const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
    title = parts[parts.length - 1] || cwd;
  }
  if (splitIndex) title = `${title} (${splitIndex})`;
  return title;
}

/** Tab titles that are just the agent brand (legacy launchAgent rename) are not real renames. */
export function isDefaultTabTitle(tabTitle: string, activeAgentId: string | null | undefined) {
  if (tabTitle === "Terminal") return true;
  if (!activeAgentId) return false;
  return tabTitle === getCliAgentDefinition(activeAgentId as CliAgentId).displayName;
}

function paneSubtitle(pane: WorkspaceTerminalTab["panes"][number], shellLabel: string) {
  const cwd = pane.cwd;
  if (!cwd || cwd === "~") return shellLabel;
  return `${shellLabel} · ${cwd}`;
}

type PaneGitInfo = {
  branch: string | null;
  isRepo: boolean;
  changedFiles: number;
  additions: number;
  deletions: number;
  repoRoot: string | null;
  isWorktree: boolean;
};

function buildPaneEntry(
  tab: WorkspaceTerminalTab,
  pane: WorkspaceTerminalTab["panes"][number],
  paneIndex: number,
  tabIndex: number,
  terminalTabCount: number,
  labels: Record<string, string>,
  activeTabId: string | null,
  activePaneId: string | null,
  git: PaneGitInfo | undefined,
): TerminalSidebarEntry {
  const shellLabel = labels[pane.shellId] ?? "Terminal";
  const splitIndex = tab.panes.length > 1 ? paneIndex + 1 : null;
  const baseTitle = isDefaultTabTitle(tab.title, pane.activeAgentId)
    ? paneDisplayTitle(pane, shellLabel, null)
    : tab.title;
  const title = splitIndex ? `${baseTitle} (${splitIndex})` : baseTitle;
  return {
    entryId: `${tab.id}:${pane.id}`,
    tabId: tab.id,
    paneId: pane.id,
    title,
    subtitle: paneSubtitle(pane, shellLabel),
    splitIndex,
    shellId: pane.shellId,
    shellLabel,
    cwd: pane.cwd,
    sessionId: pane.sessionId,
    activeAgentId: pane.activeAgentId,
    activeProcessName: pane.activeProcessName ?? null,
    activeProcessCmd: pane.activeProcessCmd ?? null,
    tabTitle: tab.title,
    renameDefault: baseTitle,
    tabColor: tab.color,
    gitBranch: git?.branch ?? null,
    gitIsRepo: git?.isRepo ?? false,
    gitChangedFiles: git?.changedFiles ?? 0,
    gitAdditions: git?.additions ?? 0,
    gitDeletions: git?.deletions ?? 0,
    gitRepoRoot: git?.repoRoot ?? null,
    gitIsWorktree: git?.isWorktree ?? false,
    isActive: tab.id === activeTabId && pane.id === activePaneId,
    hasUnseenNotification: pane.hasUnseenNotification,
    agentStatus: pane.agentStatus,
    agentStatusSeen: pane.agentStatusSeen,
    canMoveUp: tabIndex > 0,
    canMoveDown: tabIndex < terminalTabCount - 1,
    entriesBelowCount: terminalTabCount - tabIndex - 1,
    canCloseOthers: terminalTabCount > 1,
    terminalTabIndex: tabIndex,
    isFirstPaneOfTab: paneIndex === 0,
    groupId: tab.groupId,
  };
}

export function buildTerminalEntries(
  tabs: WorkspaceTab[],
  shells: ShellProfile[],
  activeTabId: string | null,
  activePaneId: string | null,
  gitByPane: Map<string, PaneGitInfo>,
): TerminalSidebarEntry[] {
  const labels = Object.fromEntries(shells.map((shell) => [shell.id, shell.label]));
  const terminalTabs = tabs.filter(isTerminalTab);

  return terminalTabs.flatMap((tab, tabIndex) =>
    tab.panes.map((pane, paneIndex) =>
      buildPaneEntry(
        tab,
        pane,
        paneIndex,
        tabIndex,
        terminalTabs.length,
        labels,
        activeTabId,
        activePaneId,
        gitByPane.get(pane.id),
      ),
    ),
  );
}

function pushTabEntries(
  tabList: WorkspaceTab[],
  entries: TerminalSidebarEntry[],
  entriesByTabId: Map<string, TerminalSidebarEntry>,
  sections: TerminalSidebarSection[],
) {
  for (const tab of tabList) {
    if (!isTerminalTab(tab)) continue;
    const firstPane = tab.panes[0];
    if (!firstPane) continue;
    const entry =
      entriesByTabId.get(tab.id) ??
      entries.find((item) => item.tabId === tab.id && item.paneId === firstPane.id);
    if (!entry) continue;
    sections.push({ kind: "entry", entry });
    for (const pane of tab.panes.slice(1)) {
      const splitEntry = entries.find((item) => item.tabId === tab.id && item.paneId === pane.id);
      if (splitEntry) sections.push({ kind: "entry", entry: splitEntry });
    }
  }
}

export function buildTerminalSidebarSections(
  groups: TerminalTabGroup[],
  collapsedGroupIds: string[],
  tabs: WorkspaceTab[],
  shells: ShellProfile[],
  activeTabId: string | null,
  activePaneId: string | null,
  gitByPane: Map<string, PaneGitInfo>,
): TerminalSidebarSection[] {
  const entries = buildTerminalEntries(tabs, shells, activeTabId, activePaneId, gitByPane);
  const entriesByTabId = new Map(entries.map((entry) => [entry.tabId, entry]));
  const terminalTabs = tabs.filter(isTerminalTab);
  const sections: TerminalSidebarSection[] = [];

  for (const group of sortGroups(groups)) {
    const groupTabs = tabsInGroup(terminalTabs, group.id);
    sections.push({
      kind: "group-header",
      groupId: group.id,
      name: group.name,
      tabCount: groupTabs.length,
      collapsed: collapsedGroupIds.includes(group.id),
      color: group.color || "none",
    });
    if (!collapsedGroupIds.includes(group.id)) {
      pushTabEntries(groupTabs, entries, entriesByTabId, sections);
    }
  }

  const looseTabs = ungroupedTabs(terminalTabs);
  if (looseTabs.length > 0) {
    if (groups.length > 0) {
      sections.push({ kind: "ungrouped-header", tabCount: looseTabs.length });
    }
    pushTabEntries(looseTabs, entries, entriesByTabId, sections);
  }

  return sections;
}

export type TerminalSidebarCategory =
  | {
      kind: "group";
      groupId: string;
      name: string;
      tabCount: number;
      collapsed: boolean;
      color: TerminalEntryColor;
      entries: TerminalSidebarEntry[];
    }
  | {
      kind: "ungrouped";
      showHeader: boolean;
      tabCount?: number;
      entries: TerminalSidebarEntry[];
    };

export function groupTerminalSidebarSections(
  sections: TerminalSidebarSection[],
): TerminalSidebarCategory[] {
  const categories: TerminalSidebarCategory[] = [];
  let current: TerminalSidebarCategory | null = null;

  for (const section of sections) {
    if (section.kind === "group-header") {
      if (current) categories.push(current);
      current = {
        kind: "group",
        groupId: section.groupId,
        name: section.name,
        tabCount: section.tabCount,
        collapsed: section.collapsed,
        color: section.color,
        entries: [],
      };
    } else if (section.kind === "ungrouped-header") {
      if (current) categories.push(current);
      current = {
        kind: "ungrouped",
        showHeader: true,
        tabCount: section.tabCount,
        entries: [],
      };
    } else if (section.kind === "entry") {
      if (!current) {
        current = { kind: "ungrouped", showHeader: false, entries: [] };
      }
      current.entries.push(section.entry);
    }
  }

  if (current) categories.push(current);
  return categories;
}

export type TerminalPathCluster = {
  kind: "path";
  pathKey: string;
  label: string;
  path: string;
  entries: TerminalSidebarEntry[];
};

export type TerminalCategoryItem = TerminalSidebarEntry | TerminalPathCluster;

export function isPathCluster(item: TerminalCategoryItem): item is TerminalPathCluster {
  return "kind" in item && item.kind === "path";
}

/** Windows-friendly key: unify separators, strip trailing slash, lowercase. */
export function normalizePathKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function pathDisplayFor(entry: TerminalSidebarEntry): string | null {
  const raw = entry.gitRepoRoot || entry.cwd;
  if (!raw || raw === "~") return null;
  return raw;
}

export function pathClusterKey(entry: TerminalSidebarEntry): string | null {
  const display = pathDisplayFor(entry);
  if (!display) return null;
  return normalizePathKey(display);
}

function pathBasename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}

/** Nest 2+ same-path entries into collapsible clusters; preserve encounter order. */
export function nestEntriesByPath(entries: TerminalSidebarEntry[]): TerminalCategoryItem[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = pathClusterKey(entry);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const emitted = new Set<string>();
  const items: TerminalCategoryItem[] = [];

  for (const entry of entries) {
    const key = pathClusterKey(entry);
    if (!key || (counts.get(key) ?? 0) < 2) {
      items.push(entry);
      continue;
    }
    if (emitted.has(key)) continue;
    emitted.add(key);
    const members = entries.filter((item) => pathClusterKey(item) === key);
    const path = pathDisplayFor(members[0]!)!;
    items.push({
      kind: "path",
      pathKey: key,
      label: pathBasename(path),
      path,
      entries: members,
    });
  }

  return items;
}

/** Hard-cut: tools are summonable windows, never session-list peers. */
export function buildFeatureEntries(
  _tabs: WorkspaceTab[],
  _activeTabId: string | null,
): FeatureSidebarEntry[] {
  return [];
}
