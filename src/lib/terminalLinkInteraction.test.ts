import { describe, expect, it } from "vitest";
import {
  resolveTerminalLinkCtrlClickAction,
  shouldEnableTerminalPathInteractions,
} from "./terminalLinkInteraction";

function mouseLike(ctrlKey: boolean, metaKey = false) {
  return { ctrlKey, metaKey } as const;
}

describe("shouldEnableTerminalPathInteractions", () => {
  it("keeps interactions enabled when tui mode is inactive", () => {
    expect(shouldEnableTerminalPathInteractions(false)).toBe(true);
  });

  it("disables interactions while tui mode is active", () => {
    expect(shouldEnableTerminalPathInteractions(true)).toBe(false);
  });
});

describe("resolveTerminalLinkCtrlClickAction", () => {
  it("opens urls when ctrl/cmd is pressed", () => {
    expect(resolveTerminalLinkCtrlClickAction(mouseLike(true), "https://example.com")).toBe(
      "open-url",
    );
    expect(resolveTerminalLinkCtrlClickAction(mouseLike(false, true), "http://example.com")).toBe(
      "open-url",
    );
  });

  it("appends non-urls when ctrl/cmd is pressed", () => {
    expect(resolveTerminalLinkCtrlClickAction(mouseLike(true), "C:\\repo\\file.ts")).toBe(
      "append-to-prompt",
    );
  });

  it("does nothing without ctrl/cmd modifier", () => {
    expect(resolveTerminalLinkCtrlClickAction(mouseLike(false), "https://example.com")).toBe(
      "none",
    );
    expect(resolveTerminalLinkCtrlClickAction(mouseLike(false), "C:\\repo\\file.ts")).toBe(
      "none",
    );
  });
});
