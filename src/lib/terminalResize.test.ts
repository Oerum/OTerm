import { describe, expect, it } from "vitest";
import {
  isValidPtySize,
  PTY_LAYOUT_WAIT_MAX_FRAMES,
  shouldBlockBootstrap,
  shouldForwardPtyResize,
} from "./terminalResize";

describe("PTY_LAYOUT_WAIT_MAX_FRAMES", () => {
  it("caps layout wait at roughly half a second at 60fps", () => {
    expect(PTY_LAYOUT_WAIT_MAX_FRAMES).toBeGreaterThanOrEqual(10);
    expect(PTY_LAYOUT_WAIT_MAX_FRAMES).toBeLessThanOrEqual(30);
  });
});

describe("isValidPtySize", () => {
  it("accepts minimum and larger dimensions", () => {
    expect(isValidPtySize(2, 2)).toBe(true);
    expect(isValidPtySize(80, 24)).toBe(true);
  });

  it("rejects undersized dimensions", () => {
    expect(isValidPtySize(1, 24)).toBe(false);
    expect(isValidPtySize(80, 1)).toBe(false);
    expect(isValidPtySize(0, 0)).toBe(false);
  });
});

describe("shouldBlockBootstrap", () => {
  it("blocks when a fatal launch error is set", () => {
    expect(
      shouldBlockBootstrap({ launchError: "spawn failed", awaitingReady: false }),
    ).toBe(true);
  });

  it("allows retry while awaiting layout or mount readiness", () => {
    expect(
      shouldBlockBootstrap({ launchError: "Terminal layout not ready", awaitingReady: true }),
    ).toBe(false);
  });

  it("allows retry after spawn timeout when marked as awaiting layout", () => {
    expect(
      shouldBlockBootstrap({ launchError: "Shell spawn timed out", awaitingReady: true }),
    ).toBe(false);
  });

  it("blocks retry after spawn timeout when not awaiting layout", () => {
    expect(
      shouldBlockBootstrap({ launchError: "Shell spawn timed out", awaitingReady: false }),
    ).toBe(true);
  });
});

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
