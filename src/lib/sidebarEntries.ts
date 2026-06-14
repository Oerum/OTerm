import type {
  FeatureSidebarEntry,
  ShellProfile,
  TerminalSidebarEntry,
  TerminalSidebarSection,
  TerminalTabGroup,
  WorkspaceTab,
  WorkspaceTerminalTab,
} from "../types/terminal";
import { isTerminalTab } from "../types/terminal";
import { getCliAgentDefinition } from "./terminalAgentMode";
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
  if (pane.oscTitle?.trim()) return pane.oscTitle.trim();
  if (pane.activeAgentId) {
    return getCliAgentDefinition(pane.activeAgentId).displayName;
  }
  const cwd = pane.cwd;
  let title = shellLabel;
  if (cwd && cwd !== "~") {
    const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
    title = parts[parts.length - 1] || cwd;
  }
  if (splitIndex) title = `${title} (${splitIndex})`;
  return title;
}

function paneSubtitle(pane: WorkspaceTerminalTab["panes"][number], shellLabel: string) {
  const cwd = pane.cwd;
  if (!cwd || cwd === "~") return shellLabel;
  return `${shellLabel} · ${cwd}`;
}

export function buildTerminalEntries(
  tabs: WorkspaceTab[],
  shells: ShellProfile[],
  activeTabId: string | null,
  activePaneId: string | null,
  gitByPane: Map<
    string,
    {
      branch: string | null;
      isRepo: boolean;
      changedFiles: number;
      additions: number;
      deletions: number;
      repoRoot: string | null;
      isWorktree: boolean;
    }
  >,
): TerminalSidebarEntry[] {
  const labels = Object.fromEntries(shells.map((shell) => [shell.id, shell.label]));

  const terminalTabs = tabs.filter(isTerminalTab);

  return terminalTabs.flatMap((tab, tabIndex) =>
    tab.panes.map((pane, paneIndex) => {
      const shellLabel = labels[pane.shellId] ?? "Terminal";
      const splitIndex = tab.panes.length > 1 ? paneIndex + 1 : null;
      const git = gitByPane.get(pane.id);
      const baseTitle =
        tab.title !== "Terminal"
          ? tab.title
          : paneDisplayTitle(pane, shellLabel, null);
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
        canMoveUp: tabIndex > 0,
        canMoveDown: tabIndex < terminalTabs.length - 1,
        entriesBelowCount: terminalTabs.length - tabIndex - 1,
        canCloseOthers: terminalTabs.length > 1,
        terminalTabIndex: tabIndex,
        isFirstPaneOfTab: paneIndex === 0,
        groupId: tab.groupId,
      };
    }),
  );
}

export function buildTerminalSidebarSections(
  groups: TerminalTabGroup[],
  collapsedGroupIds: string[],
  tabs: WorkspaceTab[],
  shells: ShellProfile[],
  activeTabId: string | null,
  activePaneId: string | null,
  gitByPane: Map<
    string,
    {
      branch: string | null;
      isRepo: boolean;
      changedFiles: number;
      additions: number;
      deletions: number;
      repoRoot: string | null;
      isWorktree: boolean;
    }
  >,
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
    if (collapsedGroupIds.includes(group.id)) continue;
    for (const tab of groupTabs) {
      const firstPane = tab.panes[0];
      if (!firstPane) continue;
      const entry = entries.find((item) => item.tabId === tab.id && item.paneId === firstPane.id);
      if (!entry) continue;
      sections.push({ kind: "entry", entry });
      for (const pane of tab.panes.slice(1)) {
        const splitEntry = entries.find((item) => item.tabId === tab.id && item.paneId === pane.id);
        if (splitEntry) sections.push({ kind: "entry", entry: splitEntry });
      }
    }
  }

  const looseTabs = ungroupedTabs(terminalTabs);
  if (looseTabs.length > 0) {
    if (groups.length > 0) {
      sections.push({
        kind: "ungrouped-header",
        tabCount: looseTabs.length,
      });
    }
    for (const tab of looseTabs) {
      const firstPane = tab.panes[0];
      if (!firstPane) continue;
      const entry = entriesByTabId.get(tab.id) ??
        entries.find((item) => item.tabId === tab.id && item.paneId === firstPane.id);
      if (!entry) continue;
      sections.push({ kind: "entry", entry });
      for (const pane of tab.panes.slice(1)) {
        const splitEntry = entries.find((item) => item.tabId === tab.id && item.paneId === pane.id);
        if (splitEntry) sections.push({ kind: "entry", entry: splitEntry });
      }
    }
  }

  return sections;
}

export function buildFeatureEntries(
  tabs: WorkspaceTab[],
  activeTabId: string | null,
): FeatureSidebarEntry[] {
  return tabs
    .filter(
      (tab) =>
        tab.kind === "pullRequests" ||
        tab.kind === "branchManager" ||
        tab.kind === "issues" ||
        tab.kind === "docker" ||
        tab.kind === "sshSftp" ||
        tab.kind === "settings",
    )
    .map((tab) => ({
      entryId: tab.id,
      tabId: tab.id,
      kind: tab.kind,
      title: tab.title,
      isActive: tab.id === activeTabId,
    }));
}
