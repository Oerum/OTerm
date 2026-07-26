import type { AgentSemanticStatus } from "../types/terminal";

export type SessionAttention =
  | "blocked-agent"
  | "working-agent"
  | "unseen-output"
  | "failed-hint"
  | "dirty-git"
  | "running-process"
  | "none";

export type SessionRadarModel = {
  attention: SessionAttention;
  attentionRank: number;
  primaryBadge: "agent" | "process" | "git" | "ssh" | "none";
  statusLabel: string | null;
  /** Dirty git +/- badge — independent of attention so agent/process rows keep stats. */
  showGitDiff: boolean;
};

export type SessionRadarInput = {
  activeAgentId: string | null | undefined;
  /** Brand name for subtitle (e.g. "Agy"); title stays project/cwd. */
  agentDisplayName?: string | null;
  agentStatus: AgentSemanticStatus;
  agentStatusSeen: boolean;
  hasUnseenNotification: boolean;
  activeProcessCmd: string | null | undefined;
  gitIsRepo: boolean;
  gitBranch: string | null;
  gitChangedFiles: number;
  sshEndpointId?: string | null;
};

const RANK: Record<SessionAttention, number> = {
  "blocked-agent": 0,
  "unseen-output": 1,
  "working-agent": 2,
  "running-process": 3,
  "dirty-git": 4,
  "failed-hint": 5,
  none: 99,
};

function resolveAttention(
  blocked: boolean,
  working: boolean,
  hasUnseenNotification: boolean,
  processCmd: string | null,
  dirty: boolean,
): SessionAttention {
  if (blocked) return "blocked-agent";
  if (hasUnseenNotification) return "unseen-output";
  if (working) return "working-agent";
  if (processCmd) return "running-process";
  if (dirty) return "dirty-git";
  return "none";
}

function resolvePrimaryBadge(
  attention: SessionAttention,
  sshEndpointId?: string | null,
): SessionRadarModel["primaryBadge"] {
  if (attention === "blocked-agent" || attention === "working-agent") return "agent";
  if (attention === "running-process") return "process";
  if (attention === "dirty-git") return "git";
  if (sshEndpointId) return "ssh";
  return "none";
}

function resolveStatusLabel(
  attention: SessionAttention,
  entry: SessionRadarInput,
  processCmd: string | null,
  withBranch: (label: string) => string,
): string | null {
  switch (attention) {
    case "blocked-agent":
      return withBranch("blocked");
    case "working-agent":
      return withBranch("working");
    case "unseen-output":
      return withBranch("new output");
    case "running-process":
      return processCmd ? withBranch(processCmd) : null;
    case "dirty-git":
      return entry.gitBranch
        ? `${entry.gitBranch} · ${entry.gitChangedFiles}`
        : `${entry.gitChangedFiles} changes`;
    default:
      return null;
  }
}

export function buildSessionRadar(entry: SessionRadarInput): SessionRadarModel {
  const hasAgent = Boolean(entry.activeAgentId);
  const blocked = hasAgent && entry.agentStatus === "blocked";
  const working = hasAgent && entry.agentStatus === "working";
  const processCmd = entry.activeProcessCmd?.trim() || null;
  const dirty = entry.gitIsRepo && entry.gitChangedFiles > 0;

  const attention = resolveAttention(blocked, working, entry.hasUnseenNotification, processCmd, dirty);
  const primaryBadge = resolvePrimaryBadge(attention, entry.sshEndpointId);

  // When a higher attention owns the subtitle, keep branch so git context isn't lost.
  const withBranch = (label: string) =>
    dirty && entry.gitBranch ? `${label} · ${entry.gitBranch}` : label;

  let statusLabel = resolveStatusLabel(attention, entry, processCmd, withBranch);

  // Agent identity in subtitle so the title can stay project/cwd (scannable).
  const agentLabel = entry.agentDisplayName?.trim() || null;
  if (agentLabel) {
    statusLabel = statusLabel ? `${agentLabel} · ${statusLabel}` : withBranch(agentLabel);
  }

  return {
    attention,
    attentionRank: RANK[attention],
    primaryBadge,
    statusLabel,
    showGitDiff: dirty,
  };
}
