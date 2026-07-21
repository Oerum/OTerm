/** In-memory commit-message drafts keyed by Source Control scope (pane/tab). */
const drafts = new Map<string, string>();

export function getCommitDraft(scopeKey: string | null | undefined): string {
  if (!scopeKey) return "";
  return drafts.get(scopeKey) ?? "";
}

export function setCommitDraft(scopeKey: string | null | undefined, message: string): void {
  if (!scopeKey) return;
  const trimmed = message;
  if (trimmed.length === 0) {
    drafts.delete(scopeKey);
    return;
  }
  drafts.set(scopeKey, trimmed);
}

export function clearCommitDraft(scopeKey: string | null | undefined): void {
  if (!scopeKey) return;
  drafts.delete(scopeKey);
}

/** Test-only: wipe all drafts. */
export function _resetCommitDraftsForTests(): void {
  drafts.clear();
}
