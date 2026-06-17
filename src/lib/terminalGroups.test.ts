import { describe, expect, it } from "vitest";
import {
  findNextCyclableTabId,
  isWorkspaceTabCyclable,
  nextGroupOrder,
  sortGroups,
  tabsInGroup,
  ungroupedTabs,
} from "./terminalGroups";
import type { TerminalTabGroup, WorkspaceTab, WorkspaceTerminalTab } from "../types/terminal";

function tab(id: string, groupId: string | null = null): WorkspaceTerminalTab {
  return {
    kind: "terminal",
    id,
    title: id,
    color: "none",
    split: "none",
    groupId,
    panes: [
      {
        id: `${id}-pane`,
        sessionId: null,
        bootstrappingSessionId: null,
        shellId: "cmd",
        cwd: "~",
        customTitle: null,
        activeAgentId: null,
        oscTitle: null,
        hasUnseenNotification: false,
        sshEndpointId: null,
      },
    ],
  };
}

describe("terminalGroups", () => {
  it("sorts groups by order then name", () => {
    const groups: TerminalTabGroup[] = [
      { id: "b", name: "Beta", order: 1, color: "none" },
      { id: "a", name: "Alpha", order: 0, color: "none" },
      { id: "c", name: "Gamma", order: 1, color: "none" },
    ];
    expect(sortGroups(groups).map((group) => group.id)).toEqual(["a", "b", "c"]);
  });

  it("filters tabs by group while preserving flat order", () => {
    const tabs = [tab("1", "g1"), tab("2", null), tab("3", "g1"), tab("4", "g2")];
    expect(tabsInGroup(tabs, "g1").map((item) => item.id)).toEqual(["1", "3"]);
    expect(ungroupedTabs(tabs).map((item) => item.id)).toEqual(["2"]);
  });

  it("computes next group order", () => {
    const groups: TerminalTabGroup[] = [
      { id: "a", name: "A", order: 0, color: "none" },
      { id: "b", name: "B", order: 3, color: "none" },
    ];
    expect(nextGroupOrder(groups)).toBe(4);
  });
});

function featureTab(id: string): WorkspaceTab {
  return { kind: "settings", id, title: id };
}

describe("isWorkspaceTabCyclable", () => {
  it("allows ungrouped and expanded-group terminal tabs", () => {
    expect(isWorkspaceTabCyclable(tab("1", null), ["g1"])).toBe(true);
    expect(isWorkspaceTabCyclable(tab("2", "g1"), [])).toBe(true);
  });

  it("blocks terminal tabs in collapsed groups", () => {
    expect(isWorkspaceTabCyclable(tab("2", "g1"), ["g1"])).toBe(false);
  });

  it("always allows feature tabs", () => {
    expect(isWorkspaceTabCyclable(featureTab("settings"), ["g1"])).toBe(true);
  });
});

describe("findNextCyclableTabId", () => {
  const tabs: WorkspaceTab[] = [
    tab("a", null),
    tab("b", "g1"),
    tab("c", "g1"),
    tab("d", "g2"),
    tab("e", "g2"),
  ];
  const collapsed = ["g2"];

  it("skips collapsed-group tabs when cycling forward", () => {
    expect(findNextCyclableTabId(tabs, "a", 1, collapsed)).toBe("b");
    expect(findNextCyclableTabId(tabs, "b", 1, collapsed)).toBe("c");
    expect(findNextCyclableTabId(tabs, "c", 1, collapsed)).toBe("a");
  });

  it("skips collapsed-group tabs when cycling backward", () => {
    expect(findNextCyclableTabId(tabs, "c", -1, collapsed)).toBe("b");
    expect(findNextCyclableTabId(tabs, "b", -1, collapsed)).toBe("a");
    expect(findNextCyclableTabId(tabs, "a", -1, collapsed)).toBe("c");
  });

  it("moves away from an active collapsed-group tab", () => {
    expect(findNextCyclableTabId(tabs, "d", 1, collapsed)).toBe("a");
    expect(findNextCyclableTabId(tabs, "d", -1, collapsed)).toBe("c");
  });

  it("returns null when only one cyclable tab exists", () => {
    const onlyCollapsed = [tab("d", "g2"), tab("e", "g2")];
    expect(findNextCyclableTabId(onlyCollapsed, "d", 1, collapsed)).toBeNull();
    expect(findNextCyclableTabId([tab("a", null)], "a", 1, [])).toBeNull();
  });

  it("returns null when tabs list has at most one entry", () => {
    expect(findNextCyclableTabId([], "a", 1, [])).toBeNull();
    expect(findNextCyclableTabId([tab("a", null)], null, 1, [])).toBeNull();
  });
});
