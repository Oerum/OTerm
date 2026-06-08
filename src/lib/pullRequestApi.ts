import { invoke } from "@tauri-apps/api/core";
import type {
  CreatePullRequestInput,
  PrProviderInfo,
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
