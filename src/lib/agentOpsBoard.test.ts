import { describe, expect, it } from "vitest";
import type { WorkspaceTab } from "../types/terminal";
import { buildAgentOpsRows } from "./agentOpsBoard";

function terminalTab(
  id: string,
  panes: Array<{
    id: string;
    activeAgentId: string | null;
    agentStatus: "idle" | "working" | "blocked" | "unknown";
    agentStatusSeen?: boolean;
    cwd?: string;
    customTitle?: string | null;
  }>,
): WorkspaceTab {
  return {
    kind: "terminal",
    id,
    title: id,
    color: "none",
    split: "none",
    groupId: null,
    panes: panes.map((p) => ({
      id: p.id,
      sessionId: null,
      bootstrappingSessionId: null,
      shellId: "pwsh",
      cwd: p.cwd ?? "~/proj",
      customTitle: p.customTitle ?? null,
      activeAgentId: p.activeAgentId as any,
      oscTitle: null,
      hasUnseenNotification: false,
      agentStatus: p.agentStatus,
      agentStatusSeen: p.agentStatusSeen ?? true,
      sshEndpointId: null,
    })),
  };
}

describe("buildAgentOpsRows", () => {
  it("filters panes with active agents and sorts attention first", () => {
    const tabs: WorkspaceTab[] = [
      terminalTab("t1", [
        { id: "p-idle", activeAgentId: "claude", agentStatus: "idle" },
        { id: "p-none", activeAgentId: null, agentStatus: "unknown" },
      ]),
      terminalTab("t2", [
        { id: "p-blocked", activeAgentId: "codex", agentStatus: "blocked" },
        { id: "p-working", activeAgentId: "gemini", agentStatus: "working" },
      ]),
    ];

    const rows = buildAgentOpsRows(tabs);
    expect(rows.map((r) => r.paneId)).toEqual(["p-blocked", "p-working", "p-idle"]);
    expect(rows[0]?.needsAttention).toBe(true);
    expect(rows[1]?.needsAttention).toBe(false);
  });

  it("returns empty when no agents active", () => {
    const tabs = [terminalTab("t1", [{ id: "p1", activeAgentId: null, agentStatus: "unknown" }])];
    expect(buildAgentOpsRows(tabs)).toEqual([]);
  });
});
