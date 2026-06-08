export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
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
  changedFiles: number;
  additions: number;
  deletions: number;
  staged: GitFileEntry[];
  changes: GitFileEntry[];
  untracked: GitFileEntry[];
}

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
