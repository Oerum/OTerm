import { invoke } from "@tauri-apps/api/core";
import type {
  GitBranchList,
  GitCommitEntry,
  GitFileDiff,
  GitSourceControlStatus,
  GitStagedDiffContext,
  GitStatus,
  GitWorkingFile,
  GitWorktreeInfo,
} from "../types/git";

export function getGitStatus(path?: string): Promise<GitStatus> {
  return invoke<GitStatus>("git_status", { path: path ?? null });
}

export function getSourceControlStatus(path?: string): Promise<GitSourceControlStatus> {
  return invoke<GitSourceControlStatus>("git_source_control_status", { path: path ?? null });
}

export function stageGitPaths(repoRoot: string, paths: string[]): Promise<void> {
  return invoke("git_stage_paths", { repoRoot, paths });
}

export function unstageGitPaths(repoRoot: string, paths: string[]): Promise<void> {
  return invoke("git_unstage_paths", { repoRoot, paths });
}

export function revertTrackedGitPaths(repoRoot: string, paths: string[]): Promise<void> {
  return invoke("git_revert_tracked_paths", { repoRoot, paths });
}

export function revertUntrackedGitPaths(repoRoot: string, paths: string[]): Promise<void> {
  return invoke("git_revert_untracked_paths", { repoRoot, paths });
}

export function commitGitChanges(repoRoot: string, message: string): Promise<void> {
  return invoke("git_commit", { repoRoot, message });
}

export function pushGitRepo(repoRoot: string): Promise<void> {
  return invoke("git_push", { repoRoot });
}

export function fetchGitRepo(repoRoot: string): Promise<void> {
  return invoke("git_fetch", { repoRoot });
}

export function pullGitRepo(repoRoot: string): Promise<void> {
  return invoke("git_pull", { repoRoot });
}

export function syncGitRepo(repoRoot: string): Promise<void> {
  return invoke("git_sync", { repoRoot });
}

export function listGitBranches(repoRoot: string): Promise<GitBranchList> {
  return invoke<GitBranchList>("git_list_branches", { repoRoot });
}

export function listGitWorktrees(repoRoot: string): Promise<GitWorktreeInfo[]> {
  return invoke<GitWorktreeInfo[]>("git_list_worktrees", { repoRoot });
}

export function switchGitBranchApi(
  repoRoot: string,
  branch: string,
  isRemote: boolean,
): Promise<void> {
  return invoke("git_checkout_branch", { repoRoot, branch, isRemote });
}

export function getGitLog(repoRoot: string, limit = 20): Promise<GitCommitEntry[]> {
  return invoke<GitCommitEntry[]>("git_log", { repoRoot, limit });
}

export function getGitFileDiff(
  repoRoot: string,
  path: string,
  staged: boolean,
  untracked: boolean,
): Promise<GitFileDiff> {
  return invoke<GitFileDiff>("git_file_diff", { repoRoot, path, staged, untracked });
}

export function getGitStagedDiff(repoRoot: string): Promise<GitStagedDiffContext> {
  return invoke<GitStagedDiffContext>("git_staged_diff", { repoRoot });
}

export function readGitWorkingFile(repoRoot: string, path: string): Promise<GitWorkingFile> {
  return invoke<GitWorkingFile>("git_read_working_file", { repoRoot, path });
}

export function writeGitWorkingFile(
  repoRoot: string,
  path: string,
  content: string,
): Promise<void> {
  return invoke("git_write_working_file", { repoRoot, path, content });
}

export function revertGitHunk(
  repoRoot: string,
  path: string,
  hunkPatch: string,
  staged: boolean,
): Promise<void> {
  return invoke("git_revert_hunk", { repoRoot, path, hunkPatch, staged });
}

export function stageGitHunk(
  repoRoot: string,
  path: string,
  hunkPatch: string,
): Promise<void> {
  return invoke("git_stage_hunk", { repoRoot, path, hunkPatch });
}

export function unstageGitHunk(
  repoRoot: string,
  path: string,
  hunkPatch: string,
): Promise<void> {
  return invoke("git_unstage_hunk", { repoRoot, path, hunkPatch });
}
