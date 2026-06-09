import { describe, expect, it } from "vitest";
import type { ShellProfile, WorkspaceTerminalTab } from "../types/terminal";
import { buildTerminalEntries, paneDisplayTitle } from "./sidebarEntries";

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
    panes: [
      {
        id: "pane-1",
        sessionId: "session-1",
        shellId: "pwsh",
        cwd: "~/projects/oterm",
        customTitle: null,
        activeAgentId: null,
        oscTitle: null,
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

  it("uses OSC title when set", () => {
    const pane = terminalTab().panes[0];
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

  it("shows OSC title when set and tab is not renamed", () => {
    const tab = terminalTab();
    tab.panes[0].oscTitle = "Refactor sidebar";
    const entries = buildTerminalEntries([tab], shells, tab.id, tab.panes[0].id, new Map());
    expect(entries[0]?.title).toBe("Refactor sidebar");
  });

  it("hides OSC title when tab is manually renamed", () => {
    const tab = terminalTab({ title: "My tab" });
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
});
