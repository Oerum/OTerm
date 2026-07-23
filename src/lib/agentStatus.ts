import type { CliAgentId } from "./terminalAgentMode";

import type { AgentSemanticStatus } from "../types/terminal";

export type AgentDisplayStatus = AgentSemanticStatus | "done";

export interface AgentStatusInput {
  activeAgentId: CliAgentId | null;
  outputTail: string;
  oscTitle: string | null;
  hasRecentOutput: boolean;
}

const OUTPUT_TAIL_MAX = 4000;

const BLOCKED_PATTERNS = [
  /\ballow\b.*\?/i,
  /\bapprove\b/i,
  /\bpermission\b/i,
  /\(y\)\s*es\s*\/\s*\(n\)o/i,
  /\byes\s*\/\s*no\b/i,
  /press\s+enter\s+to\s+confirm/i,
  /waiting\s+for\s+(?:your\s+)?(?:approval|confirmation|input)/i,
  /\[(?:y\/n|Y\/n|y\/N)\]/,
  /requires?\s+(?:your\s+)?(?:approval|confirmation)/i,
];

const WORKING_PATTERNS = [
  /[\u2800-\u28ff]/, // braille spinners
  /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/,
  /(?:^|\n)\s*(?:thinking|planning|running|executing|generating)\b/i,
];

export function appendOutputTail(current: string, chunk: string): string {
  if (!chunk) return current;
  const merged = current + chunk;
  if (merged.length <= OUTPUT_TAIL_MAX) return merged;
  return merged.slice(-OUTPUT_TAIL_MAX);
}

export function classifyAgentStatus(input: AgentStatusInput): AgentSemanticStatus {
  if (!input.activeAgentId) {
    return "unknown";
  }

  const tail = input.outputTail;
  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(tail))) {
    return "blocked";
  }

  if (
    input.hasRecentOutput ||
    input.oscTitle?.trim() ||
    WORKING_PATTERNS.some((pattern) => pattern.test(tail))
  ) {
    return "working";
  }

  return "working";
}

export function displayAgentStatus(
  status: AgentSemanticStatus,
  seen: boolean,
): AgentDisplayStatus {
  if (status === "idle" && !seen) return "done";
  return status;
}

export function agentStatusLabel(status: AgentDisplayStatus): string {
  switch (status) {
    case "working":
      return "Working";
    case "blocked":
      return "Blocked";
    case "done":
      return "Done";
    case "idle":
      return "Idle";
    default:
      return "Unknown";
  }
}

export function agentStatusDotClass(status: AgentDisplayStatus): string {
  switch (status) {
    case "blocked":
      return "bg-red-400";
    case "working":
      return "bg-amber-400 animate-pulse";
    case "done":
      return "bg-teal-400";
    case "idle":
      return "bg-emerald-400";
    default:
      return "bg-[var(--oterm-muted)]";
  }
}

export function agentStatusTextClass(status: AgentDisplayStatus): string {
  switch (status) {
    case "blocked":
      return "text-red-400";
    case "working":
      return "text-amber-400";
    case "done":
      return "text-teal-400";
    case "idle":
      return "text-emerald-400";
    default:
      return "text-[var(--oterm-muted)]";
  }
}
