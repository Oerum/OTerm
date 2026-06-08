import { computed, ref } from "vue";
import type { ShellProfile, WorkspacePane, WorkspaceTab } from "../types/terminal";

let nextId = 1;
function uid(prefix: string) {
  return `${prefix}-${nextId++}`;
}

export function useWorkspace(defaultShellId: string) {
  const shells = ref<ShellProfile[]>([]);
  const tabs = ref<WorkspaceTab[]>([]);
  const activeTabId = ref<string | null>(null);
  const activePaneId = ref<string | null>(null);

  const activeTab = computed(() =>
    tabs.value.find((tab) => tab.id === activeTabId.value) ?? null,
  );

  const activePane = computed(() => {
    const tab = activeTab.value;
    if (!tab) return null;
    return tab.panes.find((pane) => pane.id === activePaneId.value) ?? tab.panes[0] ?? null;
  });

  function createPane(shellId = defaultShellId): WorkspacePane {
    return {
      id: uid("pane"),
      sessionId: null,
      shellId,
      cwd: "~",
    };
  }

  function createTab(shellId = defaultShellId) {
    const pane = createPane(shellId);
    const tab: WorkspaceTab = {
      id: uid("tab"),
      title: "Terminal",
      panes: [pane],
      split: "none",
    };
    tabs.value.push(tab);
    activeTabId.value = tab.id;
    activePaneId.value = pane.id;
    return tab;
  }

  function closeTab(tabId: string) {
    const index = tabs.value.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;
    tabs.value.splice(index, 1);
    if (activeTabId.value === tabId) {
      const next = tabs.value[index] ?? tabs.value[index - 1] ?? null;
      activeTabId.value = next?.id ?? null;
      activePaneId.value = next?.panes[0]?.id ?? null;
    }
  }

  function splitActiveTabHorizontal(shellId = defaultShellId) {
    const tab = activeTab.value;
    if (!tab || tab.split === "horizontal") return;
    tab.split = "horizontal";
    tab.panes.push(createPane(shellId));
  }

  function selectTab(tabId: string) {
    activeTabId.value = tabId;
    const tab = tabs.value.find((item) => item.id === tabId);
    activePaneId.value = tab?.panes[0]?.id ?? null;
  }

  function selectPane(paneId: string) {
    activePaneId.value = paneId;
  }

  function setPaneSession(paneId: string, sessionId: string) {
    for (const tab of tabs.value) {
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.sessionId = sessionId;
        return;
      }
    }
  }

  function clearPaneSession(paneId: string) {
    for (const tab of tabs.value) {
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.sessionId = null;
        return;
      }
    }
  }

  function setPaneCwd(paneId: string, cwd: string) {
    for (const tab of tabs.value) {
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.cwd = cwd;
        return;
      }
    }
  }

  function setPaneShell(paneId: string, shellId: string) {
    for (const tab of tabs.value) {
      const pane = tab.panes.find((item) => item.id === paneId);
      if (pane) {
        pane.shellId = shellId;
        return;
      }
    }
  }

  return {
    shells,
    tabs,
    activeTabId,
    activePaneId,
    activeTab,
    activePane,
    createTab,
    closeTab,
    splitActiveTabHorizontal,
    selectTab,
    selectPane,
    setPaneSession,
    clearPaneSession,
    setPaneCwd,
    setPaneShell,
  };
}
