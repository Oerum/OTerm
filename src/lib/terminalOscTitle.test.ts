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

  it("drops shell executable path titles", () => {
    expect(normalizeOscTitle("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBeNull();
    expect(
      normalizeOscTitle("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"),
    ).toBeNull();
  });
});
