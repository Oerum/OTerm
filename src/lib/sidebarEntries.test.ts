import { describe, expect, it } from "vitest";
import type { ShellProfile, WorkspaceTerminalTab } from "../types/terminal";
import { buildTerminalEntries, buildTerminalSidebarSections, groupTerminalSidebarSections, paneDisplayTitle } from "./sidebarEntries";

const shells: ShellProfile[] = [
  { id: "pwsh", label: "PowerShell", program: "pwsh.exe", args: [] },
];

function terminalTab(overrides: Partial<WorkspaceTerminalTab> = {}): WorkspaceTerminalTab {
  return {
    kind: "terminal",
    id: "tab-1",
    title: "Terminal",
    color: "none",
    split: "none",
    groupId: null,
    panes: [
      {
        id: "pane-1",
        sessionId: "session-1",
        bootstrappingSessionId: null,
        shellId: "pwsh",
        cwd: "~/projects/oterm",
        customTitle: null,
        activeAgentId: null,
        oscTitle: null,
        hasUnseenNotification: false,
        agentStatus: "unknown",
        agentStatusSeen: true,
        sshEndpointId: null,
      },
    ],
    ...overrides,
  };
}

describe("paneDisplayTitle", () => {
  it("uses agent display name when activeAgentId is set", () => {
    const pane = terminalTab().panes[0];
    pane.activeAgentId = "claude";
    expect(paneDisplayTitle(pane, "PowerShell", null)).toBe("Claude Code");
  });

  it("prefers customTitle over agent name", () => {
    const pane = terminalTab().panes[0];
    pane.activeAgentId = "claude";
    pane.customTitle = "My dev shell";
    expect(paneDisplayTitle(pane, "PowerShell", null)).toBe("My dev shell");
  });

  it("uses OSC title when agent is active and sets it", () => {
    const pane = terminalTab().panes[0];
    pane.activeAgentId = "claude";
    pane.oscTitle = "Fix auth bug";
    expect(paneDisplayTitle(pane, "PowerShell", null)).toBe("Fix auth bug");
  });

  it("prefers OSC title over agent display name", () => {
    const pane = terminalTab().panes[0];
    pane.activeAgentId = "claude";
    pane.oscTitle = "Implementing feature X";
    expect(paneDisplayTitle(pane, "PowerShell", null)).toBe("Implementing feature X");
  });

  it("prefers customTitle over OSC title", () => {
    const pane = terminalTab().panes[0];
    pane.customTitle = "Pinned shell";
    pane.oscTitle = "Agent task";
    expect(paneDisplayTitle(pane, "PowerShell", null)).toBe("Pinned shell");
  });

  it("falls back to agent name when OSC title is empty", () => {
    const pane = terminalTab().panes[0];
    pane.activeAgentId = "claude";
    pane.oscTitle = "   ";
    expect(paneDisplayTitle(pane, "PowerShell", null)).toBe("Claude Code");
  });
});

describe("buildTerminalEntries", () => {
  it("shows agent display name when agent is active and tab is not renamed", () => {
    const tab = terminalTab();
    tab.panes[0].activeAgentId = "opencode";
    const entries = buildTerminalEntries([tab], shells, tab.id, tab.panes[0].id, new Map());
    expect(entries[0]?.title).toBe("OpenCode");
    expect(entries[0]?.activeAgentId).toBe("opencode");
  });

  it("keeps manual tab rename when agent is active", () => {
    const tab = terminalTab({ title: "Backend work" });
    tab.panes[0].activeAgentId = "claude";
    const entries = buildTerminalEntries([tab], shells, tab.id, tab.panes[0].id, new Map());
    expect(entries[0]?.title).toBe("Backend work");
  });

  it("shows OSC title when set, agent is active, and tab is not renamed", () => {
    const tab = terminalTab();
    tab.panes[0].activeAgentId = "claude";
    tab.panes[0].oscTitle = "Refactor sidebar";
    const entries = buildTerminalEntries([tab], shells, tab.id, tab.panes[0].id, new Map());
    expect(entries[0]?.title).toBe("Refactor sidebar");
  });

  it("hides OSC title when tab is manually renamed even if agent is active", () => {
    const tab = terminalTab({ title: "My tab" });
    tab.panes[0].activeAgentId = "claude";
    tab.panes[0].oscTitle = "Agent working";
    const entries = buildTerminalEntries([tab], shells, tab.id, tab.panes[0].id, new Map());
    expect(entries[0]?.title).toBe("My tab");
  });

  it("reverts to cwd label when agent is cleared", () => {
    const tab = terminalTab();
    tab.panes[0].activeAgentId = null;
    const entries = buildTerminalEntries([tab], shells, tab.id, tab.panes[0].id, new Map());
    expect(entries[0]?.title).toBe("oterm");
  });

  it("propagates hasUnseenNotification from pane to entry", () => {
    const tab = terminalTab();
    tab.panes[0].hasUnseenNotification = true;
    const entries = buildTerminalEntries([tab], shells, "other-tab", "other-pane", new Map());
    expect(entries[0]?.hasUnseenNotification).toBe(true);
    expect(entries[0]?.isActive).toBe(false);
  });

  it("sets terminalTabIndex and isFirstPaneOfTab for drag reorder", () => {
    const tabA = terminalTab({ id: "tab-a", title: "A" });
    const tabB = terminalTab({
      id: "tab-b",
      title: "B",
      split: "horizontal",
      panes: [
        terminalTab().panes[0],
        {
          id: "pane-2",
          sessionId: "session-2",
          bootstrappingSessionId: null,
          shellId: "pwsh",
          cwd: "~/projects/other",
          customTitle: null,
          activeAgentId: null,
          oscTitle: null,
          hasUnseenNotification: false,
          agentStatus: "unknown",
          agentStatusSeen: true,
          sshEndpointId: null,
        },
      ],
    });
    tabB.panes[0].id = "pane-b1";

    const entries = buildTerminalEntries([tabA, tabB], shells, tabA.id, tabA.panes[0].id, new Map());

    expect(entries).toHaveLength(3);
    expect(entries[0]?.terminalTabIndex).toBe(0);
    expect(entries[0]?.isFirstPaneOfTab).toBe(true);
    expect(entries[0]?.canMoveUp).toBe(false);
    expect(entries[0]?.canMoveDown).toBe(true);

    expect(entries[1]?.terminalTabIndex).toBe(1);
    expect(entries[1]?.isFirstPaneOfTab).toBe(true);
    expect(entries[2]?.terminalTabIndex).toBe(1);
    expect(entries[2]?.isFirstPaneOfTab).toBe(false);
    expect(entries[2]?.canMoveDown).toBe(false);
  });

  it("ignores feature tabs when computing terminalTabIndex", () => {
    const tab = terminalTab({ id: "tab-a" });
    const entries = buildTerminalEntries(
      [tab, { kind: "settings", id: "settings-1", title: "Settings" }],
      shells,
      tab.id,
      tab.panes[0].id,
      new Map(),
    );
    expect(entries[0]?.terminalTabIndex).toBe(0);
    expect(entries[0]?.canMoveUp).toBe(false);
    expect(entries[0]?.canMoveDown).toBe(false);
  });
});

describe("buildTerminalSidebarSections", () => {
  it("renders grouped sections with collapse and ungrouped header", () => {
    const tabA = terminalTab({ id: "tab-a", title: "A", groupId: "g1" });
    const tabB = terminalTab({ id: "tab-b", title: "B", groupId: null });
    const sections = buildTerminalSidebarSections(
      [{ id: "g1", name: "Work", order: 0, color: "none" }],
      ["g1"],
      [tabA, tabB],
      shells,
      tabA.id,
      tabA.panes[0].id,
      new Map(),
    );

    expect(sections.map((section) => section.kind)).toEqual([
      "group-header",
      "ungrouped-header",
      "entry",
    ]);
    expect(sections[0]).toMatchObject({ kind: "group-header", collapsed: true, tabCount: 1 });
    expect(sections[2]).toMatchObject({ kind: "entry", entry: { tabId: "tab-b" } });
  });

  it("shows flat entries when no groups exist", () => {
    const tab = terminalTab({ id: "tab-a" });
    const sections = buildTerminalSidebarSections([], [], [tab], shells, tab.id, tab.panes[0].id, new Map());
    expect(sections).toEqual([{ kind: "entry", entry: expect.objectContaining({ tabId: "tab-a" }) }]);
  });
});

describe("groupTerminalSidebarSections", () => {
  it("groups headers with their entries and ungrouped sections", () => {
    const tabA = terminalTab({ id: "tab-a", title: "A", groupId: "g1" });
    const tabB = terminalTab({ id: "tab-b", title: "B", groupId: null });
    const sections = buildTerminalSidebarSections(
      [{ id: "g1", name: "Work", order: 0, color: "none" }],
      [],
      [tabA, tabB],
      shells,
      tabA.id,
      tabA.panes[0].id,
      new Map(),
    );

    const categories = groupTerminalSidebarSections(sections);

    expect(categories).toHaveLength(2);
    expect(categories[0]).toMatchObject({
      kind: "group",
      groupId: "g1",
      name: "Work",
      collapsed: false,
      entries: [expect.objectContaining({ tabId: "tab-a" })],
    });
    expect(categories[1]).toMatchObject({
      kind: "ungrouped",
      showHeader: true,
      tabCount: 1,
      entries: [expect.objectContaining({ tabId: "tab-b" })],
    });
  });

  it("keeps collapsed groups as header-only categories", () => {
    const tabA = terminalTab({ id: "tab-a", groupId: "g1" });
    const sections = buildTerminalSidebarSections(
      [{ id: "g1", name: "Work", order: 0, color: "none" }],
      ["g1"],
      [tabA],
      shells,
      tabA.id,
      tabA.panes[0].id,
      new Map(),
    );

    const categories = groupTerminalSidebarSections(sections);

    expect(categories).toEqual([
      {
        kind: "group",
        groupId: "g1",
        name: "Work",
        tabCount: 1,
        collapsed: true,
        color: "none",
        entries: [],
      },
    ]);
  });

  it("wraps flat entries in a single ungrouped category without header", () => {
    const tab = terminalTab({ id: "tab-a" });
    const sections = buildTerminalSidebarSections([], [], [tab], shells, tab.id, tab.panes[0].id, new Map());
    const categories = groupTerminalSidebarSections(sections);

    expect(categories).toEqual([
      {
        kind: "ungrouped",
        showHeader: false,
        entries: [expect.objectContaining({ tabId: "tab-a" })],
      },
    ]);
  });
});
