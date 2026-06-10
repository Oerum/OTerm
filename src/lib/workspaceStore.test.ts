import { describe, expect, it } from "vitest";
import { useWorkspace } from "../composables/useWorkspace";
import type { PersistedTerminalWorkspaceV1 } from "../types/terminal";
import { isTerminalTab } from "../types/terminal";
import { parsePersistedTerminalWorkspace } from "./workspaceStore";

describe("parsePersistedTerminalWorkspace", () => {
  it("returns null for invalid json shape", () => {
    expect(parsePersistedTerminalWorkspace(null)).toBeNull();
    expect(parsePersistedTerminalWorkspace({ version: 2, tabs: [] })).toBeNull();
    expect(parsePersistedTerminalWorkspace({ version: 1, tabs: [] })).toBeNull();
  });

  it("parses a valid single-tab snapshot", () => {
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
  });

  it("clamps active indices to valid ranges", () => {
    const parsed = parsePersistedTerminalWorkspace({
      version: 1,
      activeTabIndex: 9,
      activePaneIndex: 4,
      tabs: [
        {
          title: "A",
          color: "none",
          split: "horizontal",
          panes: [
            { shellId: "cmd", cwd: "~", customTitle: null },
            { shellId: "powershell", cwd: "C:\\a", customTitle: "left" },
          ],
        },
        {
          title: "B",
          color: "blue",
          split: "none",
          panes: [{ shellId: "cmd", cwd: "C:\\b", customTitle: null }],
        },
      ],
    });
    expect(parsed?.activeTabIndex).toBe(1);
    expect(parsed?.activePaneIndex).toBe(0);
  });

  it("drops invalid tabs and panes", () => {
    const parsed = parsePersistedTerminalWorkspace({
      version: 1,
      activeTabIndex: 0,
      activePaneIndex: 0,
      tabs: [
        { title: "Bad", color: "neon", split: "none", panes: [] },
        {
          title: "Good",
          color: "yellow",
          split: "none",
          panes: [{ shellId: "", cwd: "C:\\ok", customTitle: null }],
        },
        {
          title: "Also good",
          color: "purple",
          split: "none",
          panes: [{ shellId: "cmd", cwd: "C:\\ok", customTitle: null }],
        },
      ],
    });
    expect(parsed?.tabs).toHaveLength(1);
    expect(parsed?.tabs[0].title).toBe("Also good");
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
      version: 1,
      activeTabIndex: 0,
      activePaneIndex: 0,
      tabs: [
        {
          title: "Build",
          color: "green",
          split: "none",
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

    const restored = ws.hydrateTerminalWorkspace(snapshot as PersistedTerminalWorkspaceV1, (id) => id);
    const restoredTab = restored.tabs[1];
    if (!isTerminalTab(restoredTab)) throw new Error("expected terminal tab");
    expect(restoredTab.split).toBe("horizontal");
    expect(restoredTab.panes).toHaveLength(2);
    expect(restored.activePaneId).toBe(restoredTab.panes[1].id);
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
    const snapshot: PersistedTerminalWorkspaceV1 = {
      version: 1,
      activeTabIndex: 0,
      activePaneIndex: 0,
      tabs: [
        {
          title: "Terminal",
          color: "none",
          split: "none",
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
});
