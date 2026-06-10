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

  it("maps switch blocked by local changes", () => {
    const msg = formatGitOperationError(
      new Error(
        "error: Your local changes to the following files would be overwritten by checkout:\n\tsrc/foo.ts",
      ),
    );
    expect(msg).toContain("Switch blocked");
  });

  it("maps switch blocked when git reports switch wording", () => {
    const msg = formatGitOperationError(
      new Error(
        "error: Your local changes to the following files would be overwritten by switch:\n\tsrc/foo.ts",
      ),
    );
    expect(msg).toContain("Switch blocked");
  });
});
