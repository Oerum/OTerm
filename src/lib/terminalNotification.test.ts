import { describe, expect, it } from "vitest";
import {
  containsBell,
  containsOscNotification,
  isPaneFocused,
  shouldMarkUnseenFromExplicitSignal,
  shouldMarkUnseenFromOutput,
  shouldMarkUnseenFromPrompt,
} from "./terminalNotification";

const focused = {
  paneActive: true,
  tabActive: true,
  activeAgentId: null,
  awaitingOutputSinceFocus: false,
};

const unfocused = {
  paneActive: false,
  tabActive: true,
  activeAgentId: null,
  awaitingOutputSinceFocus: false,
};

describe("containsBell", () => {
  it("detects BEL character", () => {
    expect(containsBell("hello\x07world")).toBe(true);
    expect(containsBell("hello")).toBe(false);
  });
});

describe("containsOscNotification", () => {
  it("detects iTerm OSC 777", () => {
    expect(containsOscNotification("\x1b]777;notify;\x07")).toBe(true);
  });

  it("detects urxvt OSC 9", () => {
    expect(containsOscNotification("\x1b]9;Task done\x07")).toBe(true);
  });

  it("detects generic OSC 99", () => {
    expect(containsOscNotification("\x1b]99;alert\x07")).toBe(true);
  });

  it("returns false for normal output", () => {
    expect(containsOscNotification("done!\n")).toBe(false);
  });
});

describe("isPaneFocused", () => {
  it("requires both pane and tab active", () => {
    expect(isPaneFocused(focused)).toBe(true);
    expect(isPaneFocused({ ...focused, paneActive: false })).toBe(false);
    expect(isPaneFocused({ ...focused, tabActive: false })).toBe(false);
  });
});

describe("shouldMarkUnseenFromExplicitSignal", () => {
  it("marks unseen when unfocused", () => {
    expect(shouldMarkUnseenFromExplicitSignal(unfocused)).toBe(true);
  });

  it("does not mark when focused", () => {
    expect(shouldMarkUnseenFromExplicitSignal(focused)).toBe(false);
  });
});

describe("shouldMarkUnseenFromPrompt", () => {
  it("marks unseen when agent active and unfocused", () => {
    expect(
      shouldMarkUnseenFromPrompt({ ...unfocused, activeAgentId: "claude" }),
    ).toBe(true);
  });

  it("marks unseen when awaiting output and unfocused", () => {
    expect(
      shouldMarkUnseenFromPrompt({ ...unfocused, awaitingOutputSinceFocus: true }),
    ).toBe(true);
  });

  it("does not mark idle shell prompt while unfocused", () => {
    expect(shouldMarkUnseenFromPrompt(unfocused)).toBe(false);
  });

  it("does not mark when focused", () => {
    expect(
      shouldMarkUnseenFromPrompt({ ...focused, activeAgentId: "claude" }),
    ).toBe(false);
  });
});

describe("shouldMarkUnseenFromOutput", () => {
  it("marks unseen when awaiting output and unfocused", () => {
    expect(
      shouldMarkUnseenFromOutput({ ...unfocused, awaitingOutputSinceFocus: true }),
    ).toBe(true);
  });

  it("does not mark without awaiting output", () => {
    expect(shouldMarkUnseenFromOutput(unfocused)).toBe(false);
  });
});
