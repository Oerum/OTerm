import { describe, expect, it } from "vitest";
import {
  defaultWorktreeBasePath,
  filterBranchRefs,
  joinPath,
  resolveWorktreeStartPoint,
  resolveWorktreeTargetPath,
  suggestWorktreeName,
} from "./agentWorktreeLaunch";
import type { BranchRefInfo } from "../types/branchManager";

describe("agentWorktreeLaunch", () => {
  it("defaults worktree base path to repo/.oterm", () => {
    expect(defaultWorktreeBasePath("C:\\repo")).toBe("C:\\repo\\.oterm");
    expect(defaultWorktreeBasePath("/repo")).toBe("/repo/.oterm");
  });

  it("uses saved base path when provided", () => {
    expect(defaultWorktreeBasePath("C:\\repo", "D:\\worktrees")).toBe("D:\\worktrees");
  });

  it("suggests the first unused worktree name", () => {
    expect(
      suggestWorktreeName(["C:\\repo\\.oterm\\agent-worktree-1"], ["main"], "agent-worktree"),
    ).toBe("agent-worktree-2");
  });

  it("joins paths with the base separator", () => {
    expect(joinPath("C:\\repo\\.oterm", "feature-a")).toBe("C:\\repo\\.oterm\\feature-a");
    expect(joinPath("/repo/.oterm", "feature-a")).toBe("/repo/.oterm/feature-a");
  });

  it("resolves target path from base and name", () => {
    expect(resolveWorktreeTargetPath("C:\\repo\\.oterm", "feature-a")).toBe(
      "C:\\repo\\.oterm\\feature-a",
    );
  });

  it("maps local branch to origin when requested", () => {
    const branches: BranchRefInfo[] = [
      {
        name: "main",
        shortHash: "abc",
        isRemote: false,
        isCurrent: true,
        upstream: "origin/main",
        ahead: 0,
        behind: 0,
        remoteName: null,
      },
      {
        name: "origin/main",
        shortHash: "abc",
        isRemote: true,
        isCurrent: false,
        upstream: null,
        ahead: 0,
        behind: 0,
        remoteName: "origin",
      },
    ];
    expect(resolveWorktreeStartPoint("main", true, branches)).toBe("origin/main");
    expect(resolveWorktreeStartPoint("main", false, branches)).toBe("main");
  });

  it("filters branch refs by query", () => {
    const branches: BranchRefInfo[] = [
      {
        name: "main",
        shortHash: "abc",
        isRemote: false,
        isCurrent: true,
        upstream: null,
        ahead: 0,
        behind: 0,
        remoteName: null,
      },
      {
        name: "origin/release/sprint_32_rc_1",
        shortHash: "def",
        isRemote: true,
        isCurrent: false,
        upstream: null,
        ahead: 0,
        behind: 0,
        remoteName: "origin",
      },
    ];
    expect(filterBranchRefs(branches, "release").map((branch) => branch.name)).toEqual([
      "origin/release/sprint_32_rc_1",
    ]);
  });
});
