import { describe, expect, it } from "vitest";
import { buildGraphLayout, parseDecorations, primaryBranchLabel } from "./gitGraphLayout";

describe("buildGraphLayout", () => {
  it("lays out a linear history on one lane", () => {
    const layout = buildGraphLayout([
      { hash: "c3", parents: ["c2"] },
      { hash: "c2", parents: ["c1"] },
      { hash: "c1", parents: [] },
    ]);
    expect(layout.rows).toHaveLength(3);
    expect(layout.rows.every((row) => row.nodeLane === 0)).toBe(true);
    expect(layout.totalWidth).toBe(14);
  });

  it("assigns a second lane for a fork", () => {
    const layout = buildGraphLayout([
      { hash: "b2", parents: ["b1"] },
      { hash: "a2", parents: ["a1"] },
      { hash: "b1", parents: ["root"] },
      { hash: "a1", parents: ["root"] },
      { hash: "root", parents: [] },
    ]);
    expect(layout.rows[0].nodeLane).toBe(0);
    expect(layout.rows[1].nodeLane).toBe(1);
    expect(layout.totalWidth).toBeGreaterThan(14);
  });

  it("merges lanes back together on merge commits", () => {
    const layout = buildGraphLayout([
      { hash: "merge", parents: ["b1", "a1"] },
      { hash: "b1", parents: ["root"] },
      { hash: "a1", parents: ["root"] },
      { hash: "root", parents: [] },
    ]);
    expect(layout.rows[0].nodeLane).toBeGreaterThanOrEqual(0);
    expect(layout.rows[0].paths.length).toBeGreaterThan(0);
    expect(layout.rows[0].paths.every((path) => path.color.startsWith("#"))).toBe(true);
  });

  it("assigns lane colors to path segments", () => {
    const layout = buildGraphLayout([
      { hash: "c2", parents: ["c1"] },
      { hash: "c1", parents: [] },
    ]);
    expect(layout.rows[0].color).toBe("#3794ff");
    expect(layout.rows[0].paths[0]?.color).toBe("#3794ff");
  });
});

describe("parseDecorations", () => {
  it("parses branch decorations", () => {
    expect(parseDecorations(" (HEAD -> main, origin/main)")).toEqual([
      "HEAD -> main",
      "origin/main",
    ]);
  });
});

describe("primaryBranchLabel", () => {
  it("extracts branch name from HEAD decoration", () => {
    expect(primaryBranchLabel(" (HEAD -> main, origin/main)")).toBe("main");
  });
});
