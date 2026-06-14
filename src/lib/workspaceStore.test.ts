import { describe, expect, it } from "vitest";
import { useWorkspace } from "../composables/useWorkspace";
import type { PersistedTerminalWorkspaceV1, PersistedTerminalWorkspaceV2 } from "../types/terminal";
import { isTerminalTab } from "../types/terminal";
import { parsePersistedTerminalWorkspace } from "./workspaceStore";

describe("parsePersistedTerminalWorkspace", () => {
  it("returns null for invalid json shape", () => {
    expect(parsePersistedTerminalWorkspace(null)).toBeNull();
    expect(parsePersistedTerminalWorkspace({ version: 2, tabs: [] })).toBeNull();
    expect(parsePersistedTerminalWorkspace({ version: 1, tabs: [] })).toBeNull();
  });

  it("upgrades v1 snapshots to v2", () => {
    const parsed = parsePersistedTerminalWorkspace({
      version: 1,
      activeTabIndex: 0,
      activePaneIndex: 0,
      tabs: [
        {
          title: "Build",
          color: "green",
          split: "none",
          panes: [{ shellId: "powershell", cwd: "C:\\repo", customTitle: null, sshEndpointId: null }],
        },
      ],
    });
    expect(parsed).toEqual({
      version: 2,
      groups: [],
      collapsedGroupIds: [],
      activeTabIndex: 0,
      activePaneIndex: 0,
      tabs: [
        {
          title: "Build",
          color: "green",
          split: "none",
          groupId: null,
          panes: [{ shellId: "powershell", cwd: "C:\\repo", customTitle: null, sshEndpointId: null }],
        },
      ],
    });
  });

  it("parses a valid v2 snapshot with groups", () => {
    const parsed = parsePersistedTerminalWorkspace({
      version: 2,
      groups: [{ id: "g1", name: "Work", order: 0 }],
      collapsedGroupIds: ["g1"],
      activeTabIndex: 0,
      activePaneIndex: 0,
      tabs: [
        {
          title: "Build",
          color: "green",
          split: "none",
          groupId: "g1",
          panes: [{ shellId: "powershell", cwd: "C:\\repo", customTitle: null, sshEndpointId: null }],
        },
      ],
    });
    expect(parsed?.version).toBe(2);
    expect(parsed?.groups).toEqual([{ id: "g1", name: "Work", order: 0, color: "none" }]);
    expect(parsed?.collapsedGroupIds).toEqual(["g1"]);
    expect(parsed?.tabs[0]?.groupId).toBe("g1");
  });

  it("clamps active indices to valid ranges", () => {
    const parsed = parsePersistedTerminalWorkspace({
      version: 2,
      groups: [],
      collapsedGroupIds: [],
      activeTabIndex: 9,
      activePaneIndex: 4,
      tabs: [
        {
          title: "A",
          color: "none",
          split: "horizontal",
          groupId: null,
          panes: [
            { shellId: "cmd", cwd: "~", customTitle: null },
            { shellId: "powershell", cwd: "C:\\a", customTitle: "left" },
          ],
        },
        {
          title: "B",
          color: "blue",
          split: "none",
          groupId: null,
          panes: [{ shellId: "cmd", cwd: "C:\\b", customTitle: null }],
        },
      ],
    });
    expect(parsed?.activeTabIndex).toBe(1);
    expect(parsed?.activePaneIndex).toBe(0);
  });

  it("drops invalid tabs and panes", () => {
    const parsed = parsePersistedTerminalWorkspace({
      version: 2,
      groups: [],
      collapsedGroupIds: [],
      activeTabIndex: 0,
      activePaneIndex: 0,
      tabs: [
        { title: "Bad", color: "neon", split: "none", groupId: null, panes: [] },
        {
          title: "Good",
          color: "yellow",
          split: "none",
          groupId: null,
          panes: [{ shellId: "", cwd: "C:\\ok", customTitle: null }],
        },
        {
          title: "Also good",
          color: "purple",
          split: "none",
          groupId: null,
          panes: [{ shellId: "cmd", cwd: "C:\\ok", customTitle: null }],
        },
      ],
    });
    expect(parsed?.tabs).toHaveLength(1);
    expect(parsed?.tabs[0].title).toBe("Also good");
  });

  it("clears invalid group references on load", () => {
    const parsed = parsePersistedTerminalWorkspace({
      version: 2,
      groups: [{ id: "g1", name: "Work", order: 0 }],
      collapsedGroupIds: ["missing", "g1"],
      activeTabIndex: 0,
      activePaneIndex: 0,
      tabs: [
        {
          title: "A",
          color: "none",
          split: "none",
          groupId: "missing",
          panes: [{ shellId: "cmd", cwd: "~", customTitle: null }],
        },
      ],
    });
    expect(parsed?.tabs[0]?.groupId).toBeNull();
    expect(parsed?.collapsedGroupIds).toEqual(["g1"]);
  });
});

describe("terminal workspace serialize/hydrate", () => {
  function setupWorkspace() {
    return useWorkspace(() => "powershell");
  }

  it("round-trips a single terminal tab", () => {
    const ws = setupWorkspace();
    ws.createTab("cmd", "C:\\repo");
    ws.setTabTitle(ws.tabs.value[0].id, "Build");
    ws.setTabColor(ws.tabs.value[0].id, "green");

    const snapshot = ws.serializeTerminalWorkspace();
    expect(snapshot).toEqual({
      version: 2,
      groups: [],
      collapsedGroupIds: [],
      activeTabIndex: 0,
      activePaneIndex: 0,
      tabs: [
        {
          title: "Build",
          color: "green",
          split: "none",
          groupId: null,
          panes: [{ shellId: "cmd", cwd: "C:\\repo", customTitle: null, sshEndpointId: null }],
        },
      ],
    });

    const restored = ws.hydrateTerminalWorkspace(snapshot!, (id) => id);
    expect(restored.tabs).toHaveLength(1);
    const restoredTab = restored.tabs[0];
    expect(isTerminalTab(restoredTab)).toBe(true);
    if (!isTerminalTab(restoredTab)) return;
    expect(restoredTab.title).toBe("Build");
    expect(restoredTab.panes[0].shellId).toBe("cmd");
    expect(restoredTab.panes[0].cwd).toBe("C:\\repo");
    expect(restored.activeTabId).toBe(restoredTab.id);
    expect(restored.activePaneId).toBe(restoredTab.panes[0].id);
  });

  it("preserves tab order and split panes with active selection", () => {
    const ws = setupWorkspace();
    ws.createTab("cmd", "C:\\one");
    ws.createTab("powershell", "C:\\two");
    ws.selectTab(ws.tabs.value[1].id);
    ws.splitActiveTabHorizontal("powershell");

    const tab = ws.tabs.value[1];
    if (!isTerminalTab(tab)) throw new Error("expected terminal tab");
    const secondPaneId = tab.panes[1]?.id;
    if (!secondPaneId) throw new Error("expected split pane");
    ws.selectPane(secondPaneId);

    const snapshot = ws.serializeTerminalWorkspace();
    expect(snapshot?.tabs).toHaveLength(2);
    expect(snapshot?.activeTabIndex).toBe(1);
    expect(snapshot?.activePaneIndex).toBe(1);
    expect(snapshot?.tabs[1].split).toBe("horizontal");
    expect(snapshot?.tabs[1].panes).toHaveLength(2);

    const restored = ws.hydrateTerminalWorkspace(snapshot as PersistedTerminalWorkspaceV2, (id) => id);
    const restoredTab = restored.tabs[1];
    if (!isTerminalTab(restoredTab)) throw new Error("expected terminal tab");
    expect(restoredTab.split).toBe("horizontal");
    expect(restoredTab.panes).toHaveLength(2);
    expect(restored.activePaneId).toBe(restoredTab.panes[1].id);
  });

  it("preserves groups, collapsed state, and tab group assignments", () => {
    const ws = setupWorkspace();
    const t1 = ws.createTab("cmd", "C:\\one");
    ws.createTab("cmd", "C:\\two");
    const group = ws.createGroup("Work");
    ws.setTabGroup(t1.id, group.id);
    ws.toggleGroupCollapsed(group.id);

    const snapshot = ws.serializeTerminalWorkspace();
    expect(snapshot?.groups).toEqual([{ id: group.id, name: "Work", order: group.order, color: "none" }]);
    expect(snapshot?.collapsedGroupIds).toEqual([group.id]);
    expect(snapshot?.tabs.find((tab) => tab.groupId === group.id)?.title).toBeTruthy();
    expect(snapshot?.tabs.some((tab) => tab.groupId === null)).toBe(true);

    const restored = ws.hydrateTerminalWorkspace(snapshot!, (id) => id);
    expect(restored.terminalGroups).toHaveLength(1);
    expect(restored.collapsedGroupIds).toEqual([group.id]);
    const grouped = restored.tabs.filter(isTerminalTab).filter((tab) => tab.groupId === group.id);
    expect(grouped).toHaveLength(1);
  });

  it("preserves last active terminal when a non-terminal tab is focused", () => {
    const ws = setupWorkspace();
    ws.createTab("cmd", "C:\\one");
    ws.createTab("powershell", "C:\\two");
    ws.selectTab(ws.tabs.value[1].id);
    ws.openSettingsTab();

    const snapshot = ws.serializeTerminalWorkspace();
    expect(snapshot?.activeTabIndex).toBe(1);
    expect(snapshot?.activePaneIndex).toBe(0);
  });

  it("returns null snapshot when no terminal tabs remain", () => {
    const ws = setupWorkspace();
    ws.createTab("cmd", "C:\\one");
    ws.openSettingsTab();
    ws.closeTab(ws.tabs.value[0].id);

    expect(ws.serializeTerminalWorkspace()).toBeNull();
  });

  it("falls back to default shell when hydrating unknown shell ids", () => {
    const ws = setupWorkspace();
    const snapshot: PersistedTerminalWorkspaceV2 = {
      version: 2,
      groups: [],
      collapsedGroupIds: [],
      activeTabIndex: 0,
      activePaneIndex: 0,
      tabs: [
        {
          title: "Terminal",
          color: "none",
          split: "none",
          groupId: null,
          panes: [{ shellId: "missing-shell", cwd: "~", customTitle: null }],
        },
      ],
    };

    const restored = ws.hydrateTerminalWorkspace(snapshot, (id) =>
      id === "missing-shell" ? "powershell" : id,
    );
    const restoredTab = restored.tabs[0];
    if (!isTerminalTab(restoredTab)) throw new Error("expected terminal tab");
    expect(restoredTab.panes[0].shellId).toBe("powershell");
  });

  it("upgrades v1 hydrate input through parser-backed snapshot", () => {
    const ws = setupWorkspace();
    const snapshot: PersistedTerminalWorkspaceV1 = {
      version: 1,
      activeTabIndex: 0,
      activePaneIndex: 0,
      tabs: [
        {
          title: "Terminal",
          color: "none",
          split: "none",
          panes: [{ shellId: "cmd", cwd: "~", customTitle: null }],
        },
      ],
    };
    const upgraded = parsePersistedTerminalWorkspace(snapshot);
    if (!upgraded) throw new Error("expected upgraded snapshot");
    const restored = ws.hydrateTerminalWorkspace(upgraded, (id) => id);
    expect(restored.terminalGroups).toEqual([]);
    expect(restored.tabs).toHaveLength(1);
  });
});
