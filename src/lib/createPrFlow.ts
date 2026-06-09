import type { GitBranchList, GitCommitEntry, GitSourceControlStatus } from "../types/git";
import type { PrProviderInfo, PullRequestSummary } from "../types/pullRequest";
import { inferDefaultBaseBranch, isProtectedDefaultBranch } from "./prBranchDefaults";

export function defaultCreatePrTitle(history: GitCommitEntry[], branch: string): string {
  const subject = history[0]?.subject?.trim();
  if (subject) return subject;
  return `Update ${branch}`;
}

export function initCreatePrBranches(
  branches: GitBranchList,
  upstream: string | null | undefined,
): { base: string; head: string } {
  const head = branches.current ?? branches.local[0] ?? "";
  const base = inferDefaultBaseBranch(branches, upstream, head);
  return { base, head };
}

export function hasOpenPrForHead(prs: PullRequestSummary[], head: string): boolean {
  const normalized = head.trim().toLowerCase();
  return prs.some(
    (pr) => pr.state.toUpperCase() === "OPEN" && pr.headRef.trim().toLowerCase() === normalized,
  );
}

export function shouldOfferCreatePr(
  status: GitSourceControlStatus,
  provider: PrProviderInfo | null,
  openPrs: PullRequestSummary[],
): boolean {
  if (!status.isRepo || !status.repoRoot || !status.branch) return false;
  if (isProtectedDefaultBranch(status.branch)) return false;
  if (!provider?.authOk) return false;
  if (hasOpenPrForHead(openPrs, status.branch)) return false;
  return true;
}
