import {
  displayAgentStatus,
  type AgentDisplayStatus,
} from "./agentStatus";
import type { CliAgentId } from "./terminalAgentMode";
import { getCliAgentDefinition } from "./terminalAgentMode";
import type { WorkspaceTab } from "../types/terminal";
import { isTerminalTab } from "../types/terminal";

export type AgentOpsRow = {
  tabId: string;
  paneId: string;
  agentId: CliAgentId;
  title: string;
  status: AgentDisplayStatus;
  needsAttention: boolean;
  cwd: string | null;
};

function statusRank(status: AgentDisplayStatus): number {
  switch (status) {
    case "blocked":
      return 0;
    case "working":
      return 1;
    case "done":
      return 2;
    case "idle":
      return 3;
    default:
      return 4;
  }
}

export function buildAgentOpsRows(tabs: WorkspaceTab[]): AgentOpsRow[] {
  const rows: AgentOpsRow[] = [];
  for (const tab of tabs) {
    if (!isTerminalTab(tab)) continue;
    for (const pane of tab.panes) {
      if (!pane.activeAgentId) continue;
      const status = displayAgentStatus(pane.agentStatus, pane.agentStatusSeen);
      const title =
        pane.customTitle?.trim() ||
        pane.oscTitle?.trim() ||
        getCliAgentDefinition(pane.activeAgentId).displayName;
      rows.push({
        tabId: tab.id,
        paneId: pane.id,
        agentId: pane.activeAgentId,
        title,
        status,
        needsAttention: status === "blocked",
        cwd: pane.cwd ?? null,
      });
    }
  }
  rows.sort((a, b) => {
    if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
    const rank = statusRank(a.status) - statusRank(b.status);
    if (rank !== 0) return rank;
    return a.title.localeCompare(b.title);
  });
  return rows;
}
