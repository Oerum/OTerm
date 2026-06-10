/** Short, user-facing message from git/Tauri stderr. */
export function formatGitOperationError(err: unknown): string {
  const raw = (err instanceof Error ? err.message : String(err)).trim();
  if (!raw) return "Git operation failed.";

  const lower = raw.toLowerCase();
  if (lower.includes("non-fast-forward") || (lower.includes("rejected") && lower.includes("push"))) {
    return "Push rejected: the remote has commits you don't have. Use Sync to pull and push, or Pull first.";
  }
  if (lower.includes("not possible to fast-forward") || lower.includes("ff-only")) {
    return "Fast-forward pull failed: your branch has diverged from the remote. Use Sync (rebase) or resolve manually.";
  }
  if (
    lower.includes("would be overwritten by checkout") ||
    lower.includes("would be overwritten by switch")
  ) {
    return "Switch blocked: commit, stash, or discard local changes first.";
  }

  const line = raw.split("\n").find((l) => l.trim())?.trim() ?? raw;
  return line.length > 240 ? `${line.slice(0, 240)}…` : line;
}
