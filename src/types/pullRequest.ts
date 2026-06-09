export type PrProviderId = "github" | "gitlab" | "bitbucket" | "unknown";

export interface PrProviderInfo {
  provider: PrProviderId | null;
  remoteUrl: string | null;
  canUseCli: boolean;
  authOk: boolean;
  message: string | null;
}

export interface PullRequestSummary {
  number: number;
  title: string;
  state: string;
  url: string;
  headRef: string;
  baseRef: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
}

export interface PullRequestComment {
  author: string;
  body: string;
  createdAt: string;
}

export interface PullRequestReview {
  author: string;
  state: string;
  body: string;
  submittedAt: string;
}

export interface PullRequestDetail extends PullRequestSummary {
  body: string;
  comments: PullRequestComment[];
  reviews: PullRequestReview[];
  additions: number;
  deletions: number;
  changedFiles: number;
}

export interface PrCommit {
  oid: string;
  shortOid: string;
  messageHeadline: string;
  messageBody: string;
  author: string;
  committedDate: string;
}

export interface PrCheck {
  name: string;
  state: string;
  bucket: string;
  link: string | null;
  description: string | null;
  startedAt: string | null;
  completedAt: string | null;
  workflow: string | null;
}

export interface PrChangedFile {
  path: string;
  additions: number;
  deletions: number;
  changeType: string;
}

export type PullRequestTab = "conversation" | "commits" | "checks" | "files";

export interface CreatePullRequestInput {
  repoRoot: string;
  title: string;
  body: string;
  base?: string;
  head?: string;
  draft?: boolean;
}
