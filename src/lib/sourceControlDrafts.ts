import type { SourceControlReviewDraft } from "./sourceControlAgent";

/** In-memory commit-message drafts keyed by Source Control scope (pane/tab). */
const drafts = new Map<string, string>();
const reviewDrafts = new Map<string, SourceControlReviewDraft>();

function copyReviewDraft(draft: SourceControlReviewDraft): SourceControlReviewDraft {
  const copy = <T extends SourceControlReviewDraft["editor"] | SourceControlReviewDraft["comments"][number]>(item: T): T => ({
    ...item, file: item.file ? { ...item.file } : null,
    range: item.range ? { ...item.range } : null,
  });
  return { comments: draft.comments.map(copy), editor: copy(draft.editor) };
}

export function getSourceControlReviewDraft(
  scopeKey: string | null | undefined,
  repoRoot: string | null | undefined,
): SourceControlReviewDraft {
  const draft = reviewDrafts.get(JSON.stringify([scopeKey, repoRoot]));
  return draft ? copyReviewDraft(draft) : {
    comments: [], editor: { id: null, file: null, range: null, body: "" },
  };
}

export function setSourceControlReviewDraft(
  scopeKey: string | null | undefined,
  repoRoot: string | null | undefined,
  draft: SourceControlReviewDraft,
): void {
  if (!scopeKey || !repoRoot) return;
  const key = JSON.stringify([scopeKey, repoRoot]);
  if (!draft.comments.length && !draft.editor.body && !draft.editor.file) reviewDrafts.delete(key);
  else reviewDrafts.set(key, copyReviewDraft(draft));
}

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
  reviewDrafts.clear();
}
