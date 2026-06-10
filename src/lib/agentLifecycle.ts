import { pushAppToast } from "./appToast";
import { getCliAgentDefinition, type CliAgentId } from "./terminalAgentMode";
import {
  APP_NOTIFICATION_TITLE,
  sendTerminalSystemNotification,
} from "./systemNotification";

export type AgentEndReason = "clean_exit" | "crash" | "session_ended";

const DEDUPE_MS = 4000;
const lastNotifyByPane = new Map<string, number>();

export function shouldTreatAgentPollClearAsCrash(input: {
  previousAgentId: CliAgentId | null;
  nextAgentId: CliAgentId | null;
  sessionAlive: boolean;
  cleanExitPending: boolean;
}): boolean {
  if (!input.previousAgentId || input.nextAgentId) return false;
  if (!input.sessionAlive) return false;
  return !input.cleanExitPending;
}

export function buildAgentEndedMessage(
  agentId: CliAgentId | null,
  reason: AgentEndReason,
  exitCode?: number | null,
): string {
  const name = agentId ? getCliAgentDefinition(agentId).displayName : "Agent";
  if (reason === "session_ended") {
    if (exitCode != null && exitCode !== 0) {
      return `${name} session ended (code ${exitCode})`;
    }
    return `${name} session ended`;
  }
  if (exitCode != null && exitCode !== 0) {
    return `${name} exited unexpectedly (code ${exitCode})`;
  }
  return `${name} exited unexpectedly`;
}

export function notifyAgentEnded(
  paneId: string,
  agentId: CliAgentId | null,
  reason: AgentEndReason,
  opts?: { exitCode?: number | null },
): void {
  if (reason === "clean_exit") return;

  const now = Date.now();
  const last = lastNotifyByPane.get(paneId) ?? 0;
  if (now - last < DEDUPE_MS) return;
  lastNotifyByPane.set(paneId, now);

  const message = buildAgentEndedMessage(agentId, reason, opts?.exitCode);
  pushAppToast(message, "error");
  void sendTerminalSystemNotification({
    title: APP_NOTIFICATION_TITLE,
    body: message,
  });
}

export function clearAgentLifecycleDedupe(paneId: string): void {
  lastNotifyByPane.delete(paneId);
}

/** Suppress misleading "finished/ready" OS notifications right after a crash alert. */
export function shouldSuppressReadyNotification(paneId: string): boolean {
  const last = lastNotifyByPane.get(paneId) ?? 0;
  return Date.now() - last < DEDUPE_MS;
}
