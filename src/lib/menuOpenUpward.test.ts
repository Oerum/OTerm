import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldOpenMenuUpward } from "./menuOpenUpward";

describe("shouldOpenMenuUpward", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens upward when space below is tight and top has more room", () => {
    vi.stubGlobal("window", { innerHeight: 400 });
    const anchor = {
      getBoundingClientRect: () => ({ top: 300, bottom: 320 }),
    } as HTMLElement;
    expect(shouldOpenMenuUpward(anchor, 180)).toBe(true);
  });

  it("stays downward when enough space below", () => {
    vi.stubGlobal("window", { innerHeight: 800 });
    const anchor = {
      getBoundingClientRect: () => ({ top: 100, bottom: 120 }),
    } as HTMLElement;
    expect(shouldOpenMenuUpward(anchor, 180)).toBe(false);
  });
});
