import { computed, ref } from "vue";
import { cwdForNewTerminal } from "../lib/newTerminalCwd";
import type { CliAgentId } from "../lib/terminalAgentMode";
import { normalizeOscTitle } from "../lib/terminalOscTitle";
import type {
  PersistedTerminalWorkspaceV1,
  ShellProfile,
  TerminalEntryColor,
  WorkspacePane,
  WorkspaceTab,
  WorkspaceTerminalTab,
} from "../types/terminal";
import { isTerminalTab } from "../types/terminal";

let nextId = 1;
function uid(prefix: string) {
  return `${prefix}-${nextId++}`;
}

export function useWorkspace(getDefaultShellId: () => string) {
  const shells = ref<ShellProfile[]>([]);
  const tabs = ref<WorkspaceTab[]>([]);
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
      shellId: shellId ?? getDefaultShellId(),
      cwd: cwd ?? "~",
      customTitle: null,
      activeAgentId: null,
      oscTitle: null,
      hasUnseenNotification: false,
      sshEndpointId: null,
    };
  }

  function createTab(shellId?: string, cwd?: string) {
    const pane = createPane(
      shellId,
      cwdForNewTerminal(activePane.value?.cwd, cwd),
    );
    const tab: WorkspaceTerminalTab = {
      kind: "terminal",
      id: uid("tab"),
      title: "Terminal",
      color: "none",
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
      id: uid("branch-tab"),
      title: "Branches",
      repoRoot,
    };
    tabs.value.push(tab);
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

  function setPaneSession(paneId: string, sessionId: string) {
    for (const tab of tabs.value) {
      if (!isTerminalTab(tab)) continue;
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.sessionId = sessionId;
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
        pane.activeAgentId = null;
        pane.oscTitle = null;
        pane.hasUnseenNotification = false;
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

  function serializeTerminalWorkspace(): PersistedTerminalWorkspaceV1 | null {
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
      version: 1,
      activeTabIndex,
      activePaneIndex,
      tabs: terminalTabs.map((tab) => ({
        title: tab.title,
        color: tab.color,
        split: tab.split,
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
    snapshot: PersistedTerminalWorkspaceV1,
    resolveShellId: (shellId: string) => string,
  ): { tabs: WorkspaceTab[]; activeTabId: string; activePaneId: string | null } {
    const restoredTabs: WorkspaceTerminalTab[] = snapshot.tabs.map((saved) => {
      const panes = saved.panes.map((savedPane) => ({
        id: uid("pane"),
        sessionId: null,
        shellId: resolveShellId(savedPane.shellId),
        cwd: savedPane.cwd,
        customTitle: savedPane.customTitle,
        activeAgentId: null,
        oscTitle: null,
        hasUnseenNotification: false,
        sshEndpointId: savedPane.sshEndpointId ?? null,
      }));
      return {
        kind: "terminal" as const,
        id: uid("tab"),
        title: saved.title,
        color: saved.color,
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
      activeTabId: activeTab.id,
      activePaneId,
    };
  }

  return {
    shells,
    tabs,
    activeTabId,
    activePaneId,
    activeTab,
    activeTerminalTab,
    activePane,
    createTab,
    openPullRequestsTab,
    openBranchManagerTab,
    openIssuesTab,
    openDockerManagerTab,
    openSshSftpTab,
    openSettingsTab,
    closeTab,
    splitActiveTabHorizontal,
    selectTab,
    selectPane,
    setPaneSession,
    clearPaneSession,
    setPaneSshEndpoint,
    setPaneCwd,
    setPaneAgent,
    setPaneProcess,
    setPaneOscTitle,
    setPaneUnseenNotification,
    setPaneShell,
    setTabTitle,
    setTabColor,
    moveTab,
    reorderTerminalTab,
    closeOtherTabs,
    closeTabsBelow,
    tabIdsBelow,
    serializeTerminalWorkspace,
    hydrateTerminalWorkspace,
  };
}
