import { invoke } from "@tauri-apps/api/core";
import type {
  GitCommitEntry,
  GitFileDiff,
  GitSourceControlStatus,
  GitStatus,
  GitWorkingFile,
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
