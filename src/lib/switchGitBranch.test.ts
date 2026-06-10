import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitWorktreeInfo } from "../types/git";

vi.mock("./gitApi", () => ({
  switchGitBranchApi: vi.fn(),
  listGitWorktrees: vi.fn(),
}));

import { switchGitBranchApi, listGitWorktrees } from "./gitApi";
import { resolveActiveWorktree, switchGitBranch, parseWorktreePathFromSwitchError } from "./switchGitBranch";

const mainPath = "C:/repo";
const linkedPath = "C:/repo-worktrees/feature";

const worktrees: GitWorktreeInfo[] = [
  { path: mainPath, branch: "main", head: "abc", isMain: true },
  { path: linkedPath, branch: "feature", head: "def", isMain: false },
];

describe("switchGitBranch", () => {
  const cdToPath = vi.fn(async () => {});

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listGitWorktrees).mockResolvedValue(worktrees);
  });

  it("resolves linked worktree when cwd is a subdirectory", () => {
    const wt = resolveActiveWorktree(`${linkedPath}/src/components`, worktrees);
    expect(wt?.path).toBe(linkedPath);
    expect(wt?.isMain).toBe(false);
  });

  it("CDs to main when selecting main from a linked worktree subdirectory", async () => {
    const result = await switchGitBranch({
      repoRoot: linkedPath,
      branch: "main",
      isRemote: false,
      currentBranch: "feature",
      activeCwd: `${linkedPath}/src`,
      cdToPath,
    });

    expect(result).toBe("cd");
    expect(cdToPath).toHaveBeenCalledWith(mainPath);
    expect(switchGitBranchApi).not.toHaveBeenCalled();
  });

  it("CDs to main when selecting main from a linked worktree", async () => {
    const result = await switchGitBranch({
      repoRoot: linkedPath,
      branch: "main",
      isRemote: false,
      currentBranch: "feature",
      activeCwd: linkedPath,
      cdToPath,
    });

    expect(result).toBe("cd");
    expect(cdToPath).toHaveBeenCalledWith(mainPath);
    expect(switchGitBranchApi).not.toHaveBeenCalled();
  });

  it("switches on main and CDs when selecting an unassigned branch from linked worktree", async () => {
    const result = await switchGitBranch({
      repoRoot: linkedPath,
      branch: "dev",
      isRemote: false,
      currentBranch: "feature",
      activeCwd: linkedPath,
      cdToPath,
    });

    expect(result).toBe("switch");
    expect(switchGitBranchApi).toHaveBeenCalledWith(mainPath, "dev", false);
    expect(cdToPath).toHaveBeenCalledWith(mainPath);
  });

  it("switches on repo root when already on main worktree", async () => {
    const result = await switchGitBranch({
      repoRoot: mainPath,
      branch: "dev",
      isRemote: false,
      currentBranch: "main",
      activeCwd: mainPath,
      cdToPath,
    });

    expect(result).toBe("switch");
    expect(switchGitBranchApi).toHaveBeenCalledWith(mainPath, "dev", false);
    expect(cdToPath).not.toHaveBeenCalled();
  });

  it("CDs to linked worktree when branch matches current but cwd is elsewhere", async () => {
    const result = await switchGitBranch({
      repoRoot: mainPath,
      branch: "feature",
      isRemote: false,
      currentBranch: "feature",
      activeCwd: mainPath,
      cdToPath,
    });

    expect(result).toBe("cd");
    expect(cdToPath).toHaveBeenCalledWith(linkedPath);
    expect(switchGitBranchApi).not.toHaveBeenCalled();
  });

  it("uses main path for remote switch from linked worktree", async () => {
    const result = await switchGitBranch({
      repoRoot: linkedPath,
      branch: "origin/dev",
      isRemote: true,
      currentBranch: "feature",
      activeCwd: linkedPath,
      cdToPath,
    });

    expect(result).toBe("switch");
    expect(switchGitBranchApi).toHaveBeenCalledWith(mainPath, "origin/dev", true);
    expect(cdToPath).toHaveBeenCalledWith(mainPath);
  });

  it("parses worktree path from git switch errors", () => {
    expect(
      parseWorktreePathFromSwitchError(
        "fatal: 'feature' is already checked out at 'C:/repo-worktrees/feature'",
      ),
    ).toBe("C:/repo-worktrees/feature");
    expect(
      parseWorktreePathFromSwitchError(
        "fatal: 'feature' is already used by worktree at \"C:/repo-worktrees/feature\"",
      ),
    ).toBe("C:/repo-worktrees/feature");
  });

  it("CDs to parsed worktree path when switch fails because branch is in use", async () => {
    vi.mocked(listGitWorktrees).mockResolvedValue([
      { path: mainPath, branch: "main", head: "abc", isMain: true },
    ]);
    vi.mocked(switchGitBranchApi).mockRejectedValue(
      new Error("fatal: 'feature' is already checked out at 'C:/repo-worktrees/feature'"),
    );

    const result = await switchGitBranch({
      repoRoot: mainPath,
      branch: "feature",
      isRemote: false,
      currentBranch: "main",
      activeCwd: mainPath,
      cdToPath,
    });

    expect(result).toBe("cd");
    expect(cdToPath).toHaveBeenCalledWith("C:/repo-worktrees/feature");
  });
});
