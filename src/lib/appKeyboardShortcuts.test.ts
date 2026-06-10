import { describe, expect, it } from "vitest";
import { isDictationShortcut, isTabCycleShortcut } from "./appKeyboardShortcuts";

function keyEvent(
  key: string,
  modifiers: Partial<
    Pick<KeyboardEvent, "shiftKey" | "ctrlKey" | "altKey" | "metaKey">
  > = {},
): KeyboardEvent {
  return {
    type: "keydown",
    key,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...modifiers,
  } as KeyboardEvent;
}

describe("isTabCycleShortcut", () => {
  it("matches Ctrl+Tab", () => {
    expect(isTabCycleShortcut(keyEvent("Tab", { ctrlKey: true }))).toBe(true);
  });

  it("matches Ctrl+Shift+Tab", () => {
    expect(
      isTabCycleShortcut(keyEvent("Tab", { ctrlKey: true, shiftKey: true })),
    ).toBe(true);
  });

  it("matches Meta+Tab", () => {
    expect(isTabCycleShortcut(keyEvent("Tab", { metaKey: true }))).toBe(true);
  });

  it("does not match plain Tab", () => {
    expect(isTabCycleShortcut(keyEvent("Tab"))).toBe(false);
  });

  it("does not match Shift+Tab without ctrl/meta", () => {
    expect(isTabCycleShortcut(keyEvent("Tab", { shiftKey: true }))).toBe(false);
  });
});

describe("isDictationShortcut", () => {
  it("matches Ctrl+F", () => {
    expect(isDictationShortcut(keyEvent("f", { ctrlKey: true }))).toBe(true);
    expect(isDictationShortcut(keyEvent("F", { ctrlKey: true }))).toBe(true);
  });

  it("does not match Ctrl+Shift+F", () => {
    expect(
      isDictationShortcut(keyEvent("f", { ctrlKey: true, shiftKey: true })),
    ).toBe(false);
  });

  it("does not match plain F", () => {
    expect(isDictationShortcut(keyEvent("f"))).toBe(false);
  });
});
