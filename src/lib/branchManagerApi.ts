import { invoke } from "@tauri-apps/api/core";
import type { GitCommitEntry } from "../types/git";
import type {
  BranchRefInfo,
  CommitDetails,
  CompareResult,
  GraphCommit,
  ResetMode,
} from "../types/branchManager";

export function listBranchRefs(repoRoot: string): Promise<BranchRefInfo[]> {
  return invoke<BranchRefInfo[]>("git_list_branch_refs", { repoRoot });
}

export function getCommitGraph(repoRoot: string, limit = 200): Promise<GraphCommit[]> {
  return invoke<GraphCommit[]>("git_commit_graph", { repoRoot, limit });
}

export function getCommitDetails(repoRoot: string, hash: string): Promise<CommitDetails> {
  return invoke<CommitDetails>("git_commit_details", { repoRoot, hash });
}

export function compareCommits(
  repoRoot: string,
  base: string,
  target: string,
): Promise<CompareResult> {
  return invoke<CompareResult>("git_compare_commits", { repoRoot, base, target });
}

export function listIncomingOutgoing(
  repoRoot: string,
  direction: "incoming" | "outgoing",
): Promise<GitCommitEntry[]> {
  return invoke<GitCommitEntry[]>("git_incoming_outgoing", { repoRoot, direction });
}

export function checkoutDetached(repoRoot: string, hash: string): Promise<void> {
  return invoke("git_checkout_detached", { repoRoot, hash });
}

export function createBranch(
  repoRoot: string,
  name: string,
  startPoint?: string,
): Promise<void> {
  return invoke("git_create_branch", {
    repoRoot,
    name,
    startPoint: startPoint ?? null,
  });
}

export function createTag(
  repoRoot: string,
  name: string,
  commit?: string,
  message?: string,
): Promise<void> {
  return invoke("git_create_tag", {
    repoRoot,
    name,
    commit: commit ?? null,
    message: message ?? null,
  });
}

export function revertCommit(repoRoot: string, hash: string): Promise<void> {
  return invoke("git_revert_commit", { repoRoot, hash });
}

export function resetCommit(repoRoot: string, hash: string, mode: ResetMode): Promise<void> {
  return invoke("git_reset_commit", { repoRoot, hash, mode });
}

export function cherryPickCommit(repoRoot: string, hash: string): Promise<void> {
  return invoke("git_cherry_pick", { repoRoot, hash });
}

export function squashCommits(
  repoRoot: string,
  count: number,
  message: string,
): Promise<void> {
  return invoke("git_squash_commits", { repoRoot, count, message });
}
