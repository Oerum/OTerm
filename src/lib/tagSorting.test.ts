import { describe, expect, it } from "vitest";
import { sortTags } from "./tagSorting";
import type { TagRefInfo } from "../types/branchManager";

function tag(name: string): TagRefInfo {
  return {
    name,
    hash: "dummyhash",
    shortHash: "dummy",
    onOrigin: false,
  };
}

describe("tagSorting", () => {
  it("sorts semver tags descending", () => {
    const input = [
      tag("v1.0.0"),
      tag("v2.0.0"),
      tag("v1.2.0"),
      tag("v1.10.0"),
    ];
    const result = sortTags(input).map((t) => t.name);
    expect(result).toEqual(["v2.0.0", "v1.10.0", "v1.2.0", "v1.0.0"]);
  });

  it("places semver tags above non-semver tags and sorts non-semver tags descending", () => {
    const input = [
      tag("beta-release"),
      tag("v1.0.0"),
      tag("latest"),
      tag("v2.0.0"),
      tag("alpha-release"),
    ];
    const result = sortTags(input).map((t) => t.name);
    expect(result).toEqual([
      "v2.0.0",
      "v1.0.0",
      "latest",
      "beta-release",
      "alpha-release",
    ]);
  });

  it("handles prerelease tags correctly (no prerelease comes first)", () => {
    const input = [
      tag("v1.0.0-alpha.1"),
      tag("v1.0.0"),
      tag("v1.0.0-beta.2"),
    ];
    const result = sortTags(input).map((t) => t.name);
    expect(result).toEqual([
      "v1.0.0",
      "v1.0.0-beta.2",
      "v1.0.0-alpha.1",
    ]);
  });

  it("handles incomplete version strings as semver", () => {
    const input = [
      tag("v1"),
      tag("v1.2"),
      tag("v2"),
      tag("v1.9"),
    ];
    const result = sortTags(input).map((t) => t.name);
    expect(result).toEqual(["v2", "v1.9", "v1.2", "v1"]);
  });

  it("performs natural alphabetical sort descending for non-semver tags", () => {
    const input = [
      tag("release-1"),
      tag("release-10"),
      tag("release-2"),
    ];
    const result = sortTags(input).map((t) => t.name);
    expect(result).toEqual(["release-10", "release-2", "release-1"]);
  });
});
