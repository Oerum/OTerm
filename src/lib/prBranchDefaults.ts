import type { GitBranchList } from "../types/git";

const DEFAULT_INTEGRATION_BRANCHES = ["main", "master", "develop"];

export function isProtectedDefaultBranch(name: string): boolean {
  return DEFAULT_INTEGRATION_BRANCHES.includes(name.trim().toLowerCase());
}

/** Prefer upstream tracking branch, then common default names, then any other local branch. */
export function inferDefaultBaseBranch(
  branches: GitBranchList,
  upstream: string | null | undefined,
  current: string | null | undefined,
): string {
  if (upstream) {
    const slash = upstream.indexOf("/");
    if (slash >= 0 && slash < upstream.length - 1) {
      return upstream.slice(slash + 1);
    }
    if (slash < 0) return upstream;
  }

  const locals = branches.local;
  for (const candidate of ["main", "master", "develop"]) {
    if (locals.includes(candidate) && candidate !== current) return candidate;
  }

  const other = locals.find((name) => name !== current);
  return other ?? locals[0] ?? "main";
}
