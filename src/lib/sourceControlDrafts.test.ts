import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetCommitDraftsForTests,
  clearCommitDraft,
  getCommitDraft,
  setCommitDraft,
} from "./sourceControlDrafts";

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
