import { describe, expect, it } from "vitest";
import { formatGitOperationError } from "./formatGitError";

describe("formatGitOperationError", () => {
  it("maps non-fast-forward push rejection", () => {
    const msg = formatGitOperationError(
      new Error("! [rejected] worktree/git -> worktree/git (non-fast-forward)"),
    );
    expect(msg).toContain("Sync");
  });

  it("maps ff-only pull failure", () => {
    const msg = formatGitOperationError(new Error("fatal: Not possible to fast-forward, aborting."));
    expect(msg).toContain("diverged");
  });
});
