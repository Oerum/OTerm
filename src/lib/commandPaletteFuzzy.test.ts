import { describe, expect, it } from "vitest";
import {
  filterCommandPaletteItems,
  scoreCommandPaletteMatch,
} from "./commandPaletteFuzzy";

describe("scoreCommandPaletteMatch", () => {
  it("returns 0 for empty haystack miss", () => {
    expect(scoreCommandPaletteMatch("zzz", "Open Settings")).toBe(0);
  });

  it("scores case-insensitive substring higher than nothing", () => {
    expect(scoreCommandPaletteMatch("set", "Open Settings")).toBeGreaterThan(0);
  });

  it("matches keywords when label misses", () => {
    expect(scoreCommandPaletteMatch("docker", "Containers", "docker manager")).toBeGreaterThan(0);
  });

  it("empty query scores every item equally positive", () => {
    expect(scoreCommandPaletteMatch("", "Anything")).toBeGreaterThan(0);
  });

  it("prefers earlier label match over late keywords-only match", () => {
    const early = scoreCommandPaletteMatch("git", "Git: Source Control", "");
    const late = scoreCommandPaletteMatch("git", "Open Tools", "something git related");
    expect(early).toBeGreaterThan(late);
  });
});

describe("filterCommandPaletteItems", () => {
  const items = [
    { id: "a", label: "Open Settings", keywords: "preferences" },
    { id: "b", label: "Toggle Sidebar", keywords: "" },
    { id: "c", label: "SSH host prod", keywords: "10.0.0.1" },
  ];

  it("returns all items for empty query", () => {
    expect(filterCommandPaletteItems("", items)).toHaveLength(3);
  });

  it("filters and ranks by score", () => {
    const result = filterCommandPaletteItems("prod", items);
    expect(result.map((i) => i.id)).toEqual(["c"]);
  });
});
