import { describe, expect, it } from "vitest";
import { branchSortKey, groupBranches } from "./branchGrouping";
import type { BranchRefInfo } from "../types/branchManager";

function branch(name: string, overrides: Partial<BranchRefInfo> = {}): BranchRefInfo {
  return {
    name,
    shortHash: "abc1234",
    isRemote: false,
    isCurrent: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    remoteName: null,
    ...overrides,
  };
}

function leafNames(items: ReturnType<typeof groupBranches>[number]["items"]): string[] {
  return items.map((item) => ("kind" in item && item.kind === "folder" ? item.label : item.name));
}

describe("branchSortKey", () => {
  it("strips separators used only for sorting", () => {
    expect(branchSortKey("feature/my-branch")).toBe("feature/mybranch");
    expect(branchSortKey("feature/my_branch")).toBe("feature/mybranch");
  });
});

describe("groupBranches sorting", () => {
  it("orders branches alphabetically ignoring - and _", () => {
    const refs = [branch("zebra_branch"), branch("alpha-branch"), branch("beta_branch")];
    const names = leafNames(groupBranches(refs)[0].items);
    expect(names).toEqual(["alpha-branch", "beta_branch", "zebra_branch"]);
  });

  it("keeps current branch first within its group", () => {
    const refs = [
      branch("zebra"),
      branch("alpha", { isCurrent: true }),
      branch("beta"),
    ];
    const names = leafNames(groupBranches(refs)[0].items);
    expect(names[0]).toBe("alpha");
    expect(names.slice(1)).toEqual(["beta", "zebra"]);
  });
});
