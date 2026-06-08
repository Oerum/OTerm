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

export interface CreatePullRequestInput {
  repoRoot: string;
  title: string;
  body: string;
  base?: string;
  head?: string;
  draft?: boolean;
}
