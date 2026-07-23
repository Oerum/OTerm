import { switchGitBranchApi, listGitWorktrees } from "./gitApi";
import type { GitWorktreeInfo } from "../types/git";

function normalizeGitPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function isPathInWorktree(cwdNorm: string, worktreePathNorm: string): boolean {
  return cwdNorm === worktreePathNorm || cwdNorm.startsWith(`${worktreePathNorm}/`);
}

function getMainWorktree(worktrees: GitWorktreeInfo[]): GitWorktreeInfo | undefined {
  return worktrees.find((wt) => wt.isMain) ?? worktrees[0];
}

export function resolveActiveWorktree(
  activeCwd: string | undefined,
  worktrees: GitWorktreeInfo[],
): GitWorktreeInfo | null {
  if (!activeCwd) return null;
  const cwdNorm = normalizeGitPath(activeCwd);
  return (
    worktrees.find((wt) => isPathInWorktree(cwdNorm, normalizeGitPath(wt.path))) ?? null
  );
}

export function resolveGitMutationRoot(
  repoRoot: string,
  activeCwd: string | undefined,
  worktrees: GitWorktreeInfo[],
): string {
  const active = resolveActiveWorktree(activeCwd, worktrees);
  const main = getMainWorktree(worktrees);
  if (active && !active.isMain && main) return main.path;
  return repoRoot;
}

const WORKTREE_PATH_IN_USE_RE = /\bat\s+['"]([^'"]+)['"]/i;

export function parseWorktreePathFromSwitchError(message: string): string | null {
  const match = WORKTREE_PATH_IN_USE_RE.exec(message);
  const path = match?.[1]?.trim();
  return path || null;
}

export type SwitchGitBranchResult = "noop" | "cd" | "switch";

export async function switchGitBranch(options: {
  repoRoot: string;
  branch: string;
  isRemote: boolean;
  currentBranch: string | null;
  activeCwd: string | undefined;
  cdToPath: (path: string) => Promise<void>;
}): Promise<SwitchGitBranchResult> {
  const { repoRoot, branch, isRemote, currentBranch, activeCwd, cdToPath } = options;

  const worktrees = await listGitWorktrees(repoRoot);
  const cwdNorm = activeCwd ? normalizeGitPath(activeCwd) : null;
  const activeWt = resolveActiveWorktree(activeCwd, worktrees);
  const switchRoot = resolveGitMutationRoot(repoRoot, activeCwd, worktrees);

  async function cdToSwitchRootIfNeeded() {
    if (!activeWt || activeWt.isMain) return;
    const targetNorm = normalizeGitPath(switchRoot);
    if (cwdNorm && isPathInWorktree(cwdNorm, targetNorm)) return;
    await cdToPath(switchRoot);
  }

  if (isRemote) {
    await switchGitBranchApi(switchRoot, branch, true);
    await cdToSwitchRootIfNeeded();
    return "switch";
  }

  const match = worktrees.find((wt) => wt.branch === branch);

  if (match) {
    const wtNorm = normalizeGitPath(match.path);
    if (cwdNorm && isPathInWorktree(cwdNorm, wtNorm)) {
      return "noop";
    }
    await cdToPath(match.path);
    return "cd";
  }

  if (branch === currentBranch) {
    return "noop";
  }

  try {
    await switchGitBranchApi(switchRoot, branch, false);
    await cdToSwitchRootIfNeeded();
    return "switch";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const worktreePath = parseWorktreePathFromSwitchError(msg);
    if (worktreePath) {
      await cdToPath(worktreePath);
      return "cd";
    }
    throw err;
  }
}
