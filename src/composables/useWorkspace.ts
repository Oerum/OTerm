import { computed, ref } from "vue";
import { cwdForNewTerminal } from "../lib/newTerminalCwd";
import type { CliAgentId } from "../lib/terminalAgentMode";
import { normalizeOscTitle } from "../lib/terminalOscTitle";
import type {
  AgentSemanticStatus,
  PersistedTerminalWorkspaceV2,
  ShellProfile,
  TerminalEntryColor,
  TerminalTabGroup,
  WorkspacePane,
  WorkspaceTab,
  WorkspaceTerminalTab,
} from "../types/terminal";
import { isTerminalTab } from "../types/terminal";
import { nextGroupOrder, sortGroups } from "../lib/terminalGroups";

let nextId = 1;
function uid(prefix: string) {
  return `${prefix}-${nextId++}`;
}

export function useWorkspace(getDefaultShellId: () => string) {
  const shells = ref<ShellProfile[]>([]);
  const tabs = ref<WorkspaceTab[]>([]);
  const terminalGroups = ref<TerminalTabGroup[]>([]);
  const collapsedGroupIds = ref<string[]>([]);
  const activeTabId = ref<string | null>(null);
  const activePaneId = ref<string | null>(null);
  let lastActiveTerminalTabId: string | null = null;
  let lastActiveTerminalPaneId: string | null = null;

  function rememberActiveTerminal(tabId: string, paneId: string | null) {
    lastActiveTerminalTabId = tabId;
    lastActiveTerminalPaneId = paneId;
  }

  const activeTab = computed(() =>
    tabs.value.find((tab) => tab.id === activeTabId.value) ?? null,
  );

  const activeTerminalTab = computed(() => {
    const tab = activeTab.value;
    return tab && isTerminalTab(tab) ? tab : null;
  });

  const activePane = computed(() => {
    const tab = activeTerminalTab.value;
    if (!tab) return null;
    return tab.panes.find((pane) => pane.id === activePaneId.value) ?? tab.panes[0] ?? null;
  });

  function createPane(shellId?: string, cwd?: string): WorkspacePane {
    return {
      id: uid("pane"),
      sessionId: null,
      bootstrappingSessionId: null,
      shellId: shellId ?? getDefaultShellId(),
      cwd: cwd ?? "~",
      customTitle: null,
      activeAgentId: null,
      oscTitle: null,
      hasUnseenNotification: false,
      agentStatus: "unknown",
      agentStatusSeen: true,
      sshEndpointId: null,
    };
  }

  function createTab(shellId?: string, cwd?: string, groupId: string | null = null) {
    const pane = createPane(
      shellId,
      cwdForNewTerminal(activePane.value?.cwd, cwd),
    );
    const tab: WorkspaceTerminalTab = {
      kind: "terminal",
      id: uid("tab"),
      title: "Terminal",
      color: "none",
      groupId,
      panes: [pane],
      split: "none",
    };
    tabs.value.push(tab);
    activeTabId.value = tab.id;
    activePaneId.value = pane.id;
    rememberActiveTerminal(tab.id, pane.id);
    return tab;
  }

  function openPullRequestsTab(repoRoot: string) {
    const existing = tabs.value.find(
      (tab) => tab.kind === "pullRequests" && tab.repoRoot === repoRoot,
    );
    if (existing) {
      activeTabId.value = existing.id;
      activePaneId.value = null;
      return existing;
    }
    const tab: WorkspaceTab = {
      kind: "pullRequests",
      id: uid("pr-tab"),
      title: "Pull Requests",
      repoRoot,
    };
    tabs.value.push(tab);
    activeTabId.value = tab.id;
    activePaneId.value = null;
    return tab;
  }

  function openBranchManagerTab(repoRoot: string) {
    const existing = tabs.value.find(
      (tab) => tab.kind === "branchManager" && tab.repoRoot === repoRoot,
    );
    if (existing) {
      activeTabId.value = existing.id;
      activePaneId.value = null;
      return existing;
    }
    const tab: WorkspaceTab = {
      kind: "branchManager",
      id: crypto.randomUUID(),
      title: "Branches",
      repoRoot,
    };
    tabs.value = [...tabs.value, tab];
    activeTabId.value = tab.id;
    activePaneId.value = null;
    return tab;
  }

  function openWorktreeManagerTab(repoRoot: string) {
    const existing = tabs.value.find(
      (tab) => tab.kind === "worktreeManager" && tab.repoRoot === repoRoot,
    );
    if (existing) {
      activeTabId.value = existing.id;
      activePaneId.value = null;
      return existing;
    }
    const tab: WorkspaceTab = {
      kind: "worktreeManager",
      id: crypto.randomUUID(),
      title: "Worktrees",
      repoRoot,
    };
    tabs.value = [...tabs.value, tab];
    activeTabId.value = tab.id;
    activePaneId.value = null;
    return tab;
  }

  function openIssuesTab(repoRoot: string) {
    const existing = tabs.value.find(
      (tab) => tab.kind === "issues" && tab.repoRoot === repoRoot,
    );
    if (existing) {
      activeTabId.value = existing.id;
      activePaneId.value = null;
      return existing;
    }
    const tab: WorkspaceTab = {
      kind: "issues",
      id: uid("issues-tab"),
      title: "Issues",
      repoRoot,
    };
    tabs.value.push(tab);
    activeTabId.value = tab.id;
    activePaneId.value = null;
    return tab;
  }

  function openDockerManagerTab() {
    const existing = tabs.value.find((tab) => tab.kind === "docker");
    if (existing) {
      activeTabId.value = existing.id;
      activePaneId.value = null;
      return existing;
    }
    const tab: WorkspaceTab = {
      kind: "docker",
      id: uid("docker-tab"),
      title: "Docker",
    };
    tabs.value.push(tab);
    activeTabId.value = tab.id;
    activePaneId.value = null;
    return tab;
  }

  function openSshSftpTab() {
    const existing = tabs.value.find((tab) => tab.kind === "sshSftp");
    if (existing) {
      activeTabId.value = existing.id;
      activePaneId.value = null;
      return existing;
    }
    const tab: WorkspaceTab = {
      kind: "sshSftp",
      id: uid("ssh-sftp-tab"),
      title: "SSH/SFTP",
    };
    tabs.value.push(tab);
    activeTabId.value = tab.id;
    activePaneId.value = null;
    return tab;
  }

  function openSettingsTab() {
    const existing = tabs.value.find((tab) => tab.kind === "settings");
    if (existing) {
      activeTabId.value = existing.id;
      activePaneId.value = null;
      return existing;
    }
    const tab: WorkspaceTab = {
      kind: "settings",
      id: uid("settings-tab"),
      title: "Settings",
    };
    tabs.value.push(tab);
    activeTabId.value = tab.id;
    activePaneId.value = null;
    return tab;
  }

  function closeTab(tabId: string) {
    const index = tabs.value.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;
    tabs.value.splice(index, 1);
    if (activeTabId.value === tabId) {
      const next = tabs.value[index] ?? tabs.value[index - 1] ?? null;
      activeTabId.value = next?.id ?? null;
      const nextPane =
        next && isTerminalTab(next) ? (next.panes[0]?.id ?? null) : null;
      activePaneId.value = nextPane;
      if (next && isTerminalTab(next)) {
        rememberActiveTerminal(next.id, nextPane);
      }
    }
  }

  function splitActiveTabHorizontal(shellId?: string) {
    const tab = activeTerminalTab.value;
    if (!tab || tab.split === "horizontal") return;
    tab.split = "horizontal";
    tab.panes.push(
      createPane(shellId, cwdForNewTerminal(activePane.value?.cwd)),
    );
  }

  function selectTab(tabId: string, paneId?: string) {
    activeTabId.value = tabId;
    const tab = tabs.value.find((item) => item.id === tabId);
    if (!tab || !isTerminalTab(tab)) {
      activePaneId.value = null;
      return;
    }
    const pane =
      paneId && tab.panes.some((item) => item.id === paneId)
        ? paneId
        : (tab.panes[0]?.id ?? null);
    activePaneId.value = pane;
    rememberActiveTerminal(tabId, pane);
  }

  function selectPane(paneId: string) {
    activePaneId.value = paneId;
    setPaneUnseenNotification(paneId, false);
    markPaneAgentStatusSeen(paneId);
    for (const tab of tabs.value) {
      if (!isTerminalTab(tab)) continue;
      if (tab.panes.some((pane) => pane.id === paneId)) {
        rememberActiveTerminal(tab.id, paneId);
        break;
      }
    }
  }

  function setPaneUnseenNotification(paneId: string, value: boolean) {
    for (const tab of tabs.value) {
      if (!isTerminalTab(tab)) continue;
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.hasUnseenNotification = value;
        return;
      }
    }
  }

  function setPaneAgentStatus(
    paneId: string,
    status: AgentSemanticStatus,
    seen?: boolean,
  ) {
    for (const tab of tabs.value) {
      if (!isTerminalTab(tab)) continue;
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.agentStatus = status;
        if (seen !== undefined) pane.agentStatusSeen = seen;
        return;
      }
    }
  }

  function markPaneAgentStatusSeen(paneId: string) {
    for (const tab of tabs.value) {
      if (!isTerminalTab(tab)) continue;
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.agentStatusSeen = true;
        return;
      }
    }
  }

  function setPaneSession(paneId: string, sessionId: string) {
    for (const tab of tabs.value) {
      if (!isTerminalTab(tab)) continue;
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.sessionId = sessionId;
        pane.bootstrappingSessionId = null;
        return;
      }
    }
  }

  function setPaneBootstrappingSession(paneId: string, sessionId: string) {
    for (const tab of tabs.value) {
      if (!isTerminalTab(tab)) continue;
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.bootstrappingSessionId = sessionId;
        return;
      }
    }
  }

  function clearPaneBootstrappingSession(paneId: string) {
    for (const tab of tabs.value) {
      if (!isTerminalTab(tab)) continue;
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.bootstrappingSessionId = null;
        if (!pane.sessionId) {
          pane.activeProcessName = null;
          pane.activeProcessCmd = null;
        }
        return;
      }
    }
  }

  function clearPaneSession(paneId: string) {
    for (const tab of tabs.value) {
      if (!isTerminalTab(tab)) continue;
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.sessionId = null;
        pane.bootstrappingSessionId = null;
        pane.activeAgentId = null;
        pane.activeProcessName = null;
        pane.activeProcessCmd = null;
        pane.oscTitle = null;
        pane.hasUnseenNotification = false;
        pane.agentStatus = "unknown";
        pane.agentStatusSeen = true;
        pane.sshEndpointId = null;
        return;
      }
    }
  }

  function setPaneSshEndpoint(paneId: string, endpointId: string | null) {
    for (const tab of tabs.value) {
      if (!isTerminalTab(tab)) continue;
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.sshEndpointId = endpointId;
        return;
      }
    }
  }

  function setPaneCwd(paneId: string, cwd: string) {
    for (const tab of tabs.value) {
      if (!isTerminalTab(tab)) continue;
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.cwd = cwd;
        return;
      }
    }
  }

  function setPaneAgent(paneId: string, agentId: CliAgentId | null) {
    for (const tab of tabs.value) {
      if (!isTerminalTab(tab)) continue;
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.activeAgentId = agentId;
        return;
      }
    }
  }

  function setPaneProcess(
    paneId: string,
    processName: string | null,
    command: string | null,
  ) {
    for (const tab of tabs.value) {
      if (!isTerminalTab(tab)) continue;
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.activeProcessName = processName;
        pane.activeProcessCmd = command;
        return;
      }
    }
  }

  function setPaneOscTitle(paneId: string, title: string | null) {
    for (const tab of tabs.value) {
      if (!isTerminalTab(tab)) continue;
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.oscTitle = title === null ? null : normalizeOscTitle(title);
        return;
      }
    }
  }

  function setPaneShell(paneId: string, shellId: string) {
    for (const tab of tabs.value) {
      if (!isTerminalTab(tab)) continue;
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.shellId = shellId;
        return;
      }
    }
  }

  function setTabTitle(tabId: string, title: string) {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (!tab || !isTerminalTab(tab)) return;
    const trimmed = title.trim();
    tab.title = trimmed || "Terminal";
  }

  function setTabColor(tabId: string, color: TerminalEntryColor) {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (tab && isTerminalTab(tab)) tab.color = color;
  }

  function findTerminalTab(tabId: string) {
    const tab = tabs.value.find((item) => item.id === tabId);
    return tab && isTerminalTab(tab) ? tab : null;
  }

  function createGroup(name = "New group") {
    const group: TerminalTabGroup = {
      id: uid("group"),
      name: name.trim() || "New group",
      order: nextGroupOrder(terminalGroups.value),
      color: "none",
      worktreeBasePath: null,
    };
    terminalGroups.value.push(group);
    return group;
  }

  function renameGroup(groupId: string, name: string) {
    const group = terminalGroups.value.find((item) => item.id === groupId);
    if (!group) return;
    group.name = name.trim() || "Group";
  }

  function setGroupColor(groupId: string, color: TerminalEntryColor) {
    const group = terminalGroups.value.find((item) => item.id === groupId);
    if (group) group.color = color;
  }

  function setGroupWorktreeBasePath(groupId: string, path: string) {
    const group = terminalGroups.value.find((item) => item.id === groupId);
    if (!group) return;
    const trimmed = path.trim();
    group.worktreeBasePath = trimmed || null;
  }

  function deleteGroup(groupId: string) {
    terminalGroups.value = terminalGroups.value.filter((group) => group.id !== groupId);
    collapsedGroupIds.value = collapsedGroupIds.value.filter((id) => id !== groupId);
    for (const tab of tabs.value) {
      if (isTerminalTab(tab) && tab.groupId === groupId) {
        tab.groupId = null;
      }
    }
  }

  function setTabGroup(tabId: string, groupId: string | null) {
    const tab = findTerminalTab(tabId);
    if (!tab) return;
    if (groupId && !terminalGroups.value.some((group) => group.id === groupId)) return;
    tab.groupId = groupId;
  }

  function toggleGroupCollapsed(groupId: string) {
    if (collapsedGroupIds.value.includes(groupId)) {
      collapsedGroupIds.value = collapsedGroupIds.value.filter((id) => id !== groupId);
      return;
    }
    collapsedGroupIds.value = [...collapsedGroupIds.value, groupId];
  }

  function isGroupCollapsed(groupId: string) {
    return collapsedGroupIds.value.includes(groupId);
  }

  function moveTabToGroup(tabId: string, groupId: string | null, toTerminalIndex?: number) {
    const tab = findTerminalTab(tabId);
    if (!tab) return;
    if (groupId && !terminalGroups.value.some((group) => group.id === groupId)) return;
    tab.groupId = groupId;

    if (toTerminalIndex !== undefined) {
      reorderTerminalTab(tabId, toTerminalIndex);
      return;
    }

    const terminalTabs = tabs.value.filter(isTerminalTab);
    const others = terminalTabs.filter((item) => item.id !== tabId);
    let targetIndex = others.length;
    for (let i = others.length - 1; i >= 0; i--) {
      if (others[i]!.groupId === groupId) {
        targetIndex = i + 1;
        break;
      }
    }
    reorderTerminalTab(tabId, Math.min(targetIndex, others.length));
  }

  function reorderTerminalTab(tabId: string, toTerminalIndex: number) {
    const terminalTabs = tabs.value.filter(isTerminalTab);
    const fromIndex = terminalTabs.findIndex((tab) => tab.id === tabId);
    if (fromIndex === -1) return;
    if (toTerminalIndex < 0 || toTerminalIndex >= terminalTabs.length) return;
    if (fromIndex === toTerminalIndex) return;

    const reordered = [...terminalTabs];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toTerminalIndex, 0, moved);

    let cursor = 0;
    tabs.value = tabs.value.map((tab) =>
      isTerminalTab(tab) ? reordered[cursor++]! : tab,
    );
  }

  function moveTab(tabId: string, direction: "up" | "down") {
    const terminalTabs = tabs.value.filter(isTerminalTab);
    const index = terminalTabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= terminalTabs.length) return;
    reorderTerminalTab(tabId, target);
  }

  function closeOtherTabs(keepTabId: string) {
    tabs.value = tabs.value.filter((tab) => tab.id === keepTabId);
    activeTabId.value = keepTabId;
    const kept = tabs.value[0];
    activePaneId.value =
      kept && isTerminalTab(kept) ? (kept.panes[0]?.id ?? null) : null;
  }

  function closeTabsBelow(tabId: string) {
    const index = tabs.value.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;
    const kept = tabs.value.slice(0, index + 1);
    const removedActive = !kept.some((tab) => tab.id === activeTabId.value);
    tabs.value = kept;
    if (removedActive) {
      activeTabId.value = tabId;
      const tab = kept[index];
      activePaneId.value =
        tab && isTerminalTab(tab) ? (tab.panes[0]?.id ?? null) : null;
    }
  }

  function tabIdsBelow(tabId: string) {
    const index = tabs.value.findIndex((tab) => tab.id === tabId);
    if (index === -1) return [];
    return tabs.value.slice(index + 1).map((tab) => tab.id);
  }

  function serializeTerminalWorkspace(): PersistedTerminalWorkspaceV2 | null {
    const terminalTabs = tabs.value.filter(isTerminalTab);
    if (terminalTabs.length === 0) return null;

    const focusTabId =
      activeTab.value && isTerminalTab(activeTab.value)
        ? activeTabId.value
        : lastActiveTerminalTabId;
    let activeTabIndex = terminalTabs.findIndex((tab) => tab.id === focusTabId);
    if (activeTabIndex < 0) activeTabIndex = 0;

    const activeTerminal = terminalTabs[activeTabIndex];
    const focusPaneId =
      activeTab.value && isTerminalTab(activeTab.value)
        ? activePaneId.value
        : lastActiveTerminalPaneId;
    let activePaneIndex = activeTerminal.panes.findIndex(
      (pane) => pane.id === focusPaneId,
    );
    if (activePaneIndex < 0) activePaneIndex = 0;

    return {
      version: 2,
      groups: sortGroups(terminalGroups.value).map((group) => ({
        id: group.id,
        name: group.name,
        order: group.order,
        color: group.color,
        ...(group.worktreeBasePath ? { worktreeBasePath: group.worktreeBasePath } : {}),
      })),
      collapsedGroupIds: [...collapsedGroupIds.value],
      activeTabIndex,
      activePaneIndex,
      tabs: terminalTabs.map((tab) => ({
        title: tab.title,
        color: tab.color,
        split: tab.split,
        groupId: tab.groupId,
        panes: tab.panes.map((pane) => ({
          shellId: pane.shellId,
          cwd: pane.cwd,
          customTitle: pane.customTitle,
          sshEndpointId: pane.sshEndpointId,
        })),
      })),
    };
  }

  function hydrateTerminalWorkspace(
    snapshot: PersistedTerminalWorkspaceV2,
    resolveShellId: (shellId: string) => string,
  ): {
    tabs: WorkspaceTab[];
    terminalGroups: TerminalTabGroup[];
    collapsedGroupIds: string[];
    activeTabId: string;
    activePaneId: string | null;
  } {
    terminalGroups.value = sortGroups(
      snapshot.groups.map((group) => ({
        id: group.id,
        name: group.name,
        order: group.order,
        color: group.color || "none",
        worktreeBasePath: group.worktreeBasePath ?? null,
      })),
    );
    collapsedGroupIds.value = [...snapshot.collapsedGroupIds];

    const validGroupIds = new Set(terminalGroups.value.map((group) => group.id));
    const restoredTabs: WorkspaceTerminalTab[] = snapshot.tabs.map((saved) => {
      const panes = saved.panes.map((savedPane) => ({
        id: uid("pane"),
        sessionId: null,
        bootstrappingSessionId: null,
        shellId: resolveShellId(savedPane.shellId),
        cwd: savedPane.cwd,
        customTitle: savedPane.customTitle,
        activeAgentId: null,
        oscTitle: null,
        hasUnseenNotification: false,
        agentStatus: "unknown" as const,
        agentStatusSeen: true,
        sshEndpointId: savedPane.sshEndpointId ?? null,
      }));
      const groupId =
        saved.groupId && validGroupIds.has(saved.groupId) ? saved.groupId : null;
      return {
        kind: "terminal" as const,
        id: uid("tab"),
        title: saved.title,
        color: saved.color,
        groupId,
        split: saved.split,
        panes,
      };
    });

    const activeTabIndex = Math.max(
      0,
      Math.min(snapshot.activeTabIndex, restoredTabs.length - 1),
    );
    const activeTab = restoredTabs[activeTabIndex];
    const activePaneIndex = Math.max(
      0,
      Math.min(snapshot.activePaneIndex, activeTab.panes.length - 1),
    );

    const activePaneId = activeTab.panes[activePaneIndex]?.id ?? null;
    rememberActiveTerminal(activeTab.id, activePaneId);

    return {
      tabs: restoredTabs,
      terminalGroups: terminalGroups.value,
      collapsedGroupIds: collapsedGroupIds.value,
      activeTabId: activeTab.id,
      activePaneId,
    };
  }

  return {
    shells,
    tabs,
    terminalGroups,
    collapsedGroupIds,
    activeTabId,
    activePaneId,
    activeTab,
    activeTerminalTab,
    activePane,
    createTab,
    openPullRequestsTab,
    openBranchManagerTab,
    openWorktreeManagerTab,
    openIssuesTab,
    openDockerManagerTab,
    openSshSftpTab,
    openSettingsTab,
    closeTab,
    splitActiveTabHorizontal,
    selectTab,
    selectPane,
    setPaneSession,
    setPaneBootstrappingSession,
    clearPaneBootstrappingSession,
    clearPaneSession,
    setPaneSshEndpoint,
    setPaneCwd,
    setPaneAgent,
    setPaneProcess,
    setPaneOscTitle,
    setPaneUnseenNotification,
    setPaneAgentStatus,
    markPaneAgentStatusSeen,
    setPaneShell,
    setTabTitle,
    setTabColor,
    createGroup,
    renameGroup,
    deleteGroup,
    setGroupColor,
    setGroupWorktreeBasePath,
    setTabGroup,
    toggleGroupCollapsed,
    isGroupCollapsed,
    moveTabToGroup,
    moveTab,
    reorderTerminalTab,
    closeOtherTabs,
    closeTabsBelow,
    tabIdsBelow,
    serializeTerminalWorkspace,
    hydrateTerminalWorkspace,
  };
}
