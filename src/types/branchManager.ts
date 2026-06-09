export interface BranchRefInfo {
  name: string;
  shortHash: string;
  isRemote: boolean;
  isCurrent: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
}

export interface GraphCommit {
  hash: string;
  shortHash: string;
  parents: string[];
  subject: string;
  author: string;
  date: string;
  decorations: string;
}

export interface CommitGraphPage {
  commits: GraphCommit[];
  hasMore: boolean;
  nextSkip: number;
}

export interface CommitDetails {
  hash: string;
  shortHash: string;
  subject: string;
  body: string;
  author: string;
  authorEmail: string;
  date: string;
  parents: string[];
  diff: string;
}

export interface CompareResult {
  base: string;
  target: string;
  content: string;
}

export type ResetMode = "mixed" | "hard";
