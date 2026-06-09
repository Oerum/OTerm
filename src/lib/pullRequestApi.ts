import { invoke } from "@tauri-apps/api/core";
import type {
  CreatePullRequestInput,
  PrChangedFile,
  PrCheck,
  PrCommit,
  PrProviderInfo,
  PullRequestDetail,
  PullRequestSummary,
} from "../types/pullRequest";

export function detectPrProvider(repoRoot: string): Promise<PrProviderInfo> {
  return invoke<PrProviderInfo>("pr_detect_provider", { repoRoot });
}

export function listPullRequests(
  repoRoot: string,
  includeClosed = false,
): Promise<PullRequestSummary[]> {
  return invoke<PullRequestSummary[]>("pr_list", { repoRoot, includeClosed });
}

export function viewPullRequest(
  repoRoot: string,
  number: number,
): Promise<PullRequestDetail> {
  return invoke<PullRequestDetail>("pr_view", { repoRoot, number });
}

export function listPrCommits(repoRoot: string, number: number): Promise<PrCommit[]> {
  return invoke<PrCommit[]>("pr_commits", { repoRoot, number });
}

export function listPrChecks(repoRoot: string, number: number): Promise<PrCheck[]> {
  return invoke<PrCheck[]>("pr_checks", { repoRoot, number });
}

export function listPrFiles(repoRoot: string, number: number): Promise<PrChangedFile[]> {
  return invoke<PrChangedFile[]>("pr_files", { repoRoot, number });
}

export function getPrDiff(repoRoot: string, number: number): Promise<string> {
  return invoke<string>("pr_diff", { repoRoot, number });
}

export function commentOnPullRequest(
  repoRoot: string,
  number: number,
  body: string,
): Promise<void> {
  return invoke("pr_comment", { repoRoot, number, body });
}

export function createPullRequest(input: CreatePullRequestInput): Promise<PullRequestSummary> {
  return invoke<PullRequestSummary>("pr_create", {
    repoRoot: input.repoRoot,
    title: input.title,
    body: input.body,
    base: input.base ?? null,
    head: input.head ?? null,
    draft: input.draft ?? false,
  });
}

export function checkoutPullRequest(repoRoot: string, number: number): Promise<void> {
  return invoke("pr_checkout", { repoRoot, number });
}

export function gitRemoteBrowserUrl(
  repoRoot: string,
  kind: "repo" | "branch" | "commit",
  name?: string,
): Promise<string> {
  return invoke<string>("git_remote_browser_url", { repoRoot, kind, name: name ?? null });
}
