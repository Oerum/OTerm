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

export function buildSessionRadar(entry: SessionRadarInput): SessionRadarModel {
  const hasAgent = Boolean(entry.activeAgentId);
  const blocked = hasAgent && entry.agentStatus === "blocked";
  const working = hasAgent && entry.agentStatus === "working";
  const processCmd = entry.activeProcessCmd?.trim() || null;
  const dirty =
    entry.gitIsRepo && entry.gitChangedFiles > 0;

  let attention: SessionAttention = "none";
  if (blocked) attention = "blocked-agent";
  else if (entry.hasUnseenNotification) attention = "unseen-output";
  else if (working) attention = "working-agent";
  else if (processCmd) attention = "running-process";
  else if (dirty) attention = "dirty-git";

  let primaryBadge: SessionRadarModel["primaryBadge"] = "none";
  if (attention === "blocked-agent" || attention === "working-agent") {
    primaryBadge = "agent";
  } else if (attention === "running-process") {
    primaryBadge = "process";
  } else if (attention === "dirty-git") {
    primaryBadge = "git";
  } else if (entry.sshEndpointId) {
    primaryBadge = "ssh";
  }

  // When a higher attention owns the subtitle, keep branch so git context isn't lost.
  const withBranch = (label: string) =>
    dirty && entry.gitBranch ? `${label} · ${entry.gitBranch}` : label;

  const agentLabel = entry.agentDisplayName?.trim() || null;

  let statusLabel: string | null = null;
  switch (attention) {
    case "blocked-agent":
      statusLabel = withBranch("blocked");
      break;
    case "working-agent":
      statusLabel = withBranch("working");
      break;
    case "unseen-output":
      statusLabel = withBranch("new output");
      break;
    case "running-process":
      statusLabel = processCmd ? withBranch(processCmd) : null;
      break;
    case "dirty-git":
      statusLabel = entry.gitBranch
        ? `${entry.gitBranch} · ${entry.gitChangedFiles}`
        : `${entry.gitChangedFiles} changes`;
      break;
    default:
      statusLabel = null;
  }

  // Agent identity in subtitle so the title can stay project/cwd (scannable).
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
