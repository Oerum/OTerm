import { describe, expect, it } from "vitest";
import { shouldShowScrollToBottom } from "./terminalScroll";

describe("shouldShowScrollToBottom", () => {
  it("shows when viewport is above the bottom", () => {
    expect(shouldShowScrollToBottom(10, 20)).toBe(true);
  });

  it("hides when viewport is at the bottom", () => {
    expect(shouldShowScrollToBottom(20, 20)).toBe(false);
  });
});
