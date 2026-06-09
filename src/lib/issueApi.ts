import { invoke } from "@tauri-apps/api/core";
import type { IssueDetail, IssueListFilters, IssueSummary } from "../types/issue";

export function listIssues(
  repoRoot: string,
  filters: IssueListFilters,
): Promise<IssueSummary[]> {
  return invoke<IssueSummary[]>("issue_list", { repoRoot, filters });
}

export function viewIssue(repoRoot: string, number: number): Promise<IssueDetail> {
  return invoke<IssueDetail>("issue_view", { repoRoot, number });
}

export function createBranchFromIssue(repoRoot: string, number: number): Promise<void> {
  return invoke("issue_create_branch", { repoRoot, number });
}
