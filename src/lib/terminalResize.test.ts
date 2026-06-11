import { describe, expect, it } from "vitest";
import { shouldForwardPtyResize } from "./terminalResize";

describe("shouldForwardPtyResize", () => {
  const base = {
    tabActive: true,
    cols: 80,
    rows: 24,
  };

  it("allows resize for a normal active terminal", () => {
    expect(shouldForwardPtyResize(base)).toBe(true);
  });

  it("blocks resize when tab is hidden", () => {
    expect(shouldForwardPtyResize({ ...base, tabActive: false })).toBe(false);
  });

  it("blocks resize when dimensions are too small", () => {
    expect(shouldForwardPtyResize({ ...base, cols: 1, rows: 24 })).toBe(false);
    expect(shouldForwardPtyResize({ ...base, cols: 80, rows: 1 })).toBe(false);
  });

  it("does not block resize for active visible tabs with valid dimensions", () => {
    expect(shouldForwardPtyResize({ ...base, cols: 120, rows: 40 })).toBe(true);
  });
});
