import { describe, expect, it } from "vitest";
import { normalizeOscTitle } from "./terminalOscTitle";

describe("normalizeOscTitle", () => {
  it("trims whitespace", () => {
    expect(normalizeOscTitle("  task name  ")).toBe("task name");
  });

  it("returns null for empty or whitespace-only titles", () => {
    expect(normalizeOscTitle("")).toBeNull();
    expect(normalizeOscTitle("   ")).toBeNull();
  });

  it("caps titles at 120 characters", () => {
    const long = "a".repeat(130);
    expect(normalizeOscTitle(long)).toBe("a".repeat(120));
  });
});
