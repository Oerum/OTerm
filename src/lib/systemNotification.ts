import { invoke, isTauri } from "@tauri-apps/api/core";
import type { WorkspacePane } from "../types/terminal";
import { getCliAgentDefinition, type CliAgentId } from "./terminalAgentMode";

export const APP_NOTIFICATION_TITLE = "OTerm";

export interface TerminalNotificationContent {
  title: string;
  body: string;
}

function notificationHeadline(
  pane: Pick<WorkspacePane, "activeAgentId">,
  completedAgentId?: CliAgentId | null,
): string {
  const agentId = pane.activeAgentId ?? completedAgentId ?? null;
  if (agentId) {
    return `${getCliAgentDefinition(agentId).displayName} is ready`;
  }
  return "Terminal ready";
}

function notificationDetail(
  pane: Pick<
    WorkspacePane,
    "customTitle" | "oscTitle" | "activeAgentId" | "cwd"
  >,
): string | null {
  if (pane.customTitle?.trim()) return pane.customTitle.trim();
  if (pane.activeAgentId) {
    if (pane.oscTitle?.trim()) return pane.oscTitle.trim();
  }
  const cwd = pane.cwd;
  if (cwd && cwd !== "~") {
    const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts[parts.length - 1] || cwd;
  }
  return null;
}

export function buildTerminalNotificationContent(
  pane: Pick<
    WorkspacePane,
    "customTitle" | "oscTitle" | "activeAgentId" | "cwd" | "shellId"
  >,
  _shellLabel: string,
  completedAgentId?: CliAgentId | null,
): TerminalNotificationContent {
  const headline = notificationHeadline(pane, completedAgentId);
  const detail = notificationDetail(pane);
  return {
    title: APP_NOTIFICATION_TITLE,
    body: detail ? `${headline} · ${detail}` : headline,
  };
}

export async function sendTerminalSystemNotification(
  content: TerminalNotificationContent,
): Promise<void> {
  if (!isTauri()) return;

  try {
    await invoke("send_desktop_notification", {
      title: content.title,
      body: content.body,
    });
  } catch {
    // OS denied notification or platform send failed — non-fatal.
  }
}
