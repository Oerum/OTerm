import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetCommitDraftsForTests,
  clearCommitDraft,
  getCommitDraft,
  setCommitDraft,
  getSourceControlReviewDraft,
  setSourceControlReviewDraft,
} from "./sourceControlDrafts";
import type { SourceControlReviewDraft } from "./sourceControlAgent";

describe("sourceControlDrafts", () => {
  beforeEach(() => {
    _resetCommitDraftsForTests();
  });

  it("restores prior scope message after switching away and back", () => {
    setCommitDraft("pane:a", "message for A");
    setCommitDraft("pane:b", "message for B");
    expect(getCommitDraft("pane:a")).toBe("message for A");
    expect(getCommitDraft("pane:b")).toBe("message for B");
  });

  it("clear on commit only affects current scope", () => {
    setCommitDraft("pane:a", "keep me");
    setCommitDraft("pane:b", "commit me");
    clearCommitDraft("pane:b");
    expect(getCommitDraft("pane:a")).toBe("keep me");
    expect(getCommitDraft("pane:b")).toBe("");
  });

  it("empty set removes draft", () => {
    setCommitDraft("pane:a", "temp");
    setCommitDraft("pane:a", "");
    expect(getCommitDraft("pane:a")).toBe("");
  });

  it("null scope is a no-op", () => {
    setCommitDraft(null, "ignored");
    expect(getCommitDraft(null)).toBe("");
    clearCommitDraft(null);
  });
});

describe("source control review draft storage", () => {
  const draft: SourceControlReviewDraft = {
    comments: [{ id: "one", file: { path: "a.ts", staged: true, untracked: false }, range: {
      side: "old", start: 1, end: 2, hunkHeader: "@@ -1,2 +1,2 @@", excerpt: "old\ntext",
    }, body: "saved" }],
    editor: { id: null, file: { path: "b.ts", staged: false, untracked: false }, range: null, body: "unfinished" },
  };

  it("restores saved snapshots and unfinished editor across scope/root switches", () => {
    setSourceControlReviewDraft("pane:a", "/repo", draft);
    setSourceControlReviewDraft("pane:b", "/repo", { ...draft, comments: [] });
    expect(getSourceControlReviewDraft("pane:a", "/repo")).toEqual(draft);
    expect(getSourceControlReviewDraft("pane:b", "/repo").comments).toEqual([]);
    expect(getSourceControlReviewDraft("pane:a", "/other").editor.body).toBe("");
  });

  it("uses a collision-free composite key and snapshots both writes and reads", () => {
    const original = structuredClone(draft);
    setSourceControlReviewDraft("pane:a|b", "c", original);
    setSourceControlReviewDraft("pane:a", "b|c", { ...draft, comments: [] });
    original.comments[0].file.path = "changed";
    original.comments[0].range!.excerpt = "changed";
    original.editor.body = "changed";
    const restored = getSourceControlReviewDraft("pane:a|b", "c");
    expect(restored).toEqual(draft);
    restored.comments[0].body = "mutated read";
    expect(getSourceControlReviewDraft("pane:a|b", "c")).toEqual(draft);
  });
});
