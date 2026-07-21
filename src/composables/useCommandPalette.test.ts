import { describe, expect, it } from "vitest";
import { clampActiveIndex } from "./useCommandPalette";

describe("clampActiveIndex", () => {
  it("clamps to 0 for empty list", () => {
    expect(clampActiveIndex(3, 0)).toBe(0);
  });
  it("wraps not — clamps high", () => {
    expect(clampActiveIndex(9, 3)).toBe(2);
  });
  it("clamps low", () => {
    expect(clampActiveIndex(-1, 3)).toBe(0);
  });
});
