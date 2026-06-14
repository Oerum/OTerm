import { describe, expect, it } from "vitest";
import {
  nextGroupOrder,
  sortGroups,
  tabsInGroup,
  ungroupedTabs,
} from "./terminalGroups";
import type { TerminalTabGroup, WorkspaceTerminalTab } from "../types/terminal";

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
