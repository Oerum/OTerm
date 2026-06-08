export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  changedFiles: number;
  additions: number;
  deletions: number;
}

export interface GitFileEntry {
  path: string;
  status: string;
  staged: boolean;
  untracked: boolean;
  additions: number;
  deletions: number;
}

export interface GitSourceControlStatus {
  isRepo: boolean;
  repoRoot: string | null;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  changedFiles: number;
  additions: number;
  deletions: number;
  staged: GitFileEntry[];
  changes: GitFileEntry[];
  untracked: GitFileEntry[];
}

export interface GitBranchList {
  current: string | null;
  local: string[];
  remote: string[];
}

export interface GitStagedDiffContext {
  stat: string;
  diff: string;
  truncated: boolean;
}

export type GitOperation =
  | "fetch"
  | "pull"
  | "push"
  | "sync"
  | "checkout"
  | "commit"
  | "stage"
  | "unstage"
  | "revert"
  | "refresh";

export interface GitCommitEntry {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
}

export interface GitFileDiff {
  path: string;
  staged: boolean;
  untracked: boolean;
  content: string;
}

export interface SelectedGitFile {
  path: string;
  staged: boolean;
  untracked: boolean;
}

export interface GitWorkingFile {
  content: string;
  exists: boolean;
}

export const GIT_OPERATION_LABELS: Record<GitOperation, string> = {
  fetch: "Fetching from remote…",
  pull: "Pulling changes…",
  push: "Pushing commits…",
  sync: "Syncing with remote…",
  checkout: "Switching branch…",
  commit: "Creating commit…",
  stage: "Staging changes…",
  unstage: "Unstaging changes…",
  revert: "Reverting changes…",
  refresh: "Refreshing status…",
};
