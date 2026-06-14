import { describe, expect, it } from "vitest";
import { useWorkspace } from "./useWorkspace";
import { isTerminalTab } from "../types/terminal";

function terminalTabIds(ws: ReturnType<typeof useWorkspace>) {
  return ws.tabs.value.filter(isTerminalTab).map((tab) => tab.id);
}

describe("reorderTerminalTab", () => {
  function setup() {
    return useWorkspace(() => "powershell");
  }

  it("reorders terminal tabs while preserving feature tab positions", () => {
    const ws = setup();
    const t1 = ws.createTab("cmd", "C:\\one");
    const t2 = ws.createTab("cmd", "C:\\two");
    const t3 = ws.createTab("cmd", "C:\\three");
    ws.openSettingsTab();

    expect(ws.tabs.value.map((tab) => (isTerminalTab(tab) ? "terminal" : tab.kind))).toEqual([
      "terminal",
      "terminal",
      "terminal",
      "settings",
    ]);

    ws.reorderTerminalTab(t3.id, 0);

    expect(terminalTabIds(ws)).toEqual([t3.id, t1.id, t2.id]);
    const tabs = ws.tabs.value;
    expect(tabs[tabs.length - 1]?.kind).toBe("settings");
  });

  it("moveTab swaps adjacent terminal tabs only", () => {
    const ws = setup();
    const t1 = ws.createTab("cmd", "C:\\one");
    const t2 = ws.createTab("cmd", "C:\\two");
    ws.openDockerManagerTab();

    ws.moveTab(t2.id, "up");

    expect(terminalTabIds(ws)).toEqual([t2.id, t1.id]);
    expect(ws.tabs.value.some((tab) => tab.kind === "docker")).toBe(true);
  });

  it("moveTab does not move past terminal boundaries", () => {
    const ws = setup();
    const t1 = ws.createTab("cmd", "C:\\one");
    const t2 = ws.createTab("cmd", "C:\\two");

    ws.moveTab(t1.id, "up");
    expect(terminalTabIds(ws)).toEqual([t1.id, t2.id]);

    ws.moveTab(t2.id, "down");
    expect(terminalTabIds(ws)).toEqual([t1.id, t2.id]);
  });

  it("ignores reorder for non-terminal tab ids", () => {
    const ws = setup();
    ws.createTab("cmd", "C:\\one");
    const settings = ws.openSettingsTab();

    ws.reorderTerminalTab(settings.id, 0);

    expect(terminalTabIds(ws)).toHaveLength(1);
    const tabs = ws.tabs.value;
    expect(tabs[tabs.length - 1]?.id).toBe(settings.id);
  });
});

describe("terminal groups", () => {
  function setup() {
    return useWorkspace(() => "powershell");
  }

  it("moves tabs into groups and ungroups on delete", () => {
    const ws = setup();
    const t1 = ws.createTab("cmd", "C:\\one");
    ws.createTab("cmd", "C:\\two");
    ws.createTab("cmd", "C:\\three");
    const group = ws.createGroup("Work");
    ws.moveTabToGroup(t1.id, group.id);
    const moved = ws.tabs.value.find((tab) => tab.id === t1.id);
    expect(isTerminalTab(moved!) && moved.groupId).toBe(group.id);

    ws.deleteGroup(group.id);
    const ungrouped = ws.tabs.value.find((tab) => tab.id === t1.id);
    expect(isTerminalTab(ungrouped!) && ungrouped.groupId).toBeNull();
    expect(ws.terminalGroups.value).toHaveLength(0);
  });

  it("reorders terminal tabs after assigning a shared group", () => {
    const ws = setup();
    const t1 = ws.createTab("cmd", "C:\\one");
    const t2 = ws.createTab("cmd", "C:\\two");
    ws.createTab("cmd", "C:\\three");
    const group = ws.createGroup("Work");
    ws.setTabGroup(t1.id, group.id);
    ws.setTabGroup(t2.id, group.id);

    ws.reorderTerminalTab(t2.id, 0);
    expect(terminalTabIds(ws)).toEqual([t2.id, t1.id, ws.tabs.value.filter(isTerminalTab)[2]!.id]);
  });
});
