export type ToolWindowId =
  | "docker"
  | "process"
  | "sshSftp"
  | "pullRequests"
  | "issues"
  | "branchManager"
  | "worktreeManager"
  | "settings"
  | "rebase"
  | "merge"
  | "stash"
  | "aiPreflight";

export type ToolWindowState = {
  openId: ToolWindowId | null;
  repoRoot: string | null;
};

export function openToolWindow(
  _current: ToolWindowState,
  id: ToolWindowId,
  repoRoot: string | null = null,
): ToolWindowState {
  return { openId: id, repoRoot };
}

export function closeToolWindow(): ToolWindowState {
  return { openId: null, repoRoot: null };
}

/** Feature tab kinds that must never appear as durable session peers. */
const FEATURE_TAB_KINDS = [
  "pullRequests",
  "branchManager",
  "worktreeManager",
  "issues",
  "rebase",
  "merge",
  "stash",
  "aiPreflight",
  "docker",
  "processManager",
  "sshSftp",
  "settings",
] as const;

export function isFeatureTabKind(kind: string): boolean {
  return (FEATURE_TAB_KINDS as readonly string[]).includes(kind);
}
