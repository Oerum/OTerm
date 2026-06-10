import { describe, expect, it } from "vitest";
import {
  getCtrlDEofPayload,
  getMultilineEnterPayload,
  getPtyKeyOverride,
  isAgentExitConfirmPrompt,
  resolveCtrlDTerminalPayload,
  shouldForwardPtyKeyOverride,
} from "./terminalMultilineEnter";

function keyEvent(
  key: string,
  type: string,
  modifiers: Partial<
    Pick<KeyboardEvent, "shiftKey" | "ctrlKey" | "altKey" | "metaKey">
  > = {},
): KeyboardEvent {
  return {
    type,
    key,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...modifiers,
  } as KeyboardEvent;
}

function enterEvent(
  type: string,
  modifiers: Partial<
    Pick<KeyboardEvent, "shiftKey" | "ctrlKey" | "altKey" | "metaKey">
  > = {},
): KeyboardEvent {
  return keyEvent("Enter", type, modifiers);
}

describe("getCtrlDEofPayload", () => {
  it("returns EOT for Ctrl+D on keydown", () => {
    expect(getCtrlDEofPayload(keyEvent("d", "keydown", { ctrlKey: true }))).toBe("\x04");
    expect(getCtrlDEofPayload(keyEvent("D", "keydown", { ctrlKey: true }))).toBe("\x04");
  });

  it("returns null for plain d or keyup", () => {
    expect(getCtrlDEofPayload(keyEvent("d", "keydown"))).toBeNull();
    expect(getCtrlDEofPayload(keyEvent("d", "keyup", { ctrlKey: true }))).toBeNull();
  });

  it("returns null when other modifiers are held", () => {
    expect(getCtrlDEofPayload(keyEvent("d", "keydown", { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(getCtrlDEofPayload(keyEvent("d", "keydown", { ctrlKey: true, altKey: true }))).toBeNull();
  });
});

describe("resolveCtrlDTerminalPayload", () => {
  it("returns EOT when exit is not pending", () => {
    expect(resolveCtrlDTerminalPayload(false)).toBe("\x04");
  });

  it("returns /quit when agy exit confirm is pending", () => {
    expect(resolveCtrlDTerminalPayload(true)).toBe("/quit\r");
  });
});

describe("isAgentExitConfirmPrompt", () => {
  it("detects agy confirm text in PTY output", () => {
    expect(isAgentExitConfirmPrompt("press ctrl+d again to exit")).toBe(true);
    expect(isAgentExitConfirmPrompt("Press Ctrl+D again to exit\r\n")).toBe(true);
    expect(isAgentExitConfirmPrompt("hello")).toBe(false);
  });
});

describe("getPtyKeyOverride", () => {
  it("prefers Ctrl+D over modified Enter when both match", () => {
    expect(getPtyKeyOverride(keyEvent("d", "keydown", { ctrlKey: true }))).toBe("\x04");
  });

  it("returns newline for modified Enter", () => {
    expect(getPtyKeyOverride(enterEvent("keydown", { shiftKey: true }))).toBe("\n");
  });
});

describe("shouldForwardPtyKeyOverride", () => {
  it("returns false when the pane is inactive", () => {
    expect(
      shouldForwardPtyKeyOverride(keyEvent("d", "keydown", { ctrlKey: true }), false, null),
    ).toBe(false);
  });

  it("returns true for keys inside the terminal container", () => {
    const textarea = { parentElement: {} } as unknown as HTMLElement;
    const container = {
      contains(node: Node) {
        return node === textarea;
      },
    } as unknown as HTMLElement;
    expect(
      shouldForwardPtyKeyOverride(
        { ...keyEvent("d", "keydown", { ctrlKey: true }), target: textarea } as KeyboardEvent,
        true,
        container,
      ),
    ).toBe(true);
  });

  it("returns false for keys focused on elements outside the terminal", () => {
    const sidebarButton = {} as unknown as HTMLElement;
    const container = { contains: () => false } as unknown as HTMLElement;
    expect(
      shouldForwardPtyKeyOverride(
        {
          ...keyEvent("d", "keydown", { ctrlKey: true }),
          target: sidebarButton,
        } as KeyboardEvent,
        true,
        container,
      ),
    ).toBe(false);
  });

  it("returns true when focus fell back to document body", () => {
    if (typeof document === "undefined") return;
    expect(
      shouldForwardPtyKeyOverride(
        {
          ...keyEvent("d", "keydown", { ctrlKey: true }),
          target: document.body,
        } as KeyboardEvent,
        true,
        { contains: () => false } as unknown as HTMLElement,
      ),
    ).toBe(true);
  });

  it("returns false for keys focused inside the agent composer", () => {
    const composerTextarea = {
      closest(selector: string) {
        return selector === ".agent-composer" ? {} : null;
      },
    } as unknown as HTMLElement;
    const container = {
      contains() {
        return true;
      },
    } as unknown as HTMLElement;

    expect(
      shouldForwardPtyKeyOverride(
        {
          ...enterEvent("keydown", { shiftKey: true }),
          target: composerTextarea,
        } as KeyboardEvent,
        true,
        container,
      ),
    ).toBe(false);
  });
});

describe("getMultilineEnterPayload", () => {
  it("returns newline for Shift+Enter on keydown", () => {
    expect(getMultilineEnterPayload(enterEvent("keydown", { shiftKey: true }))).toBe("\n");
  });

  it("returns newline for Ctrl+Enter on keydown", () => {
    expect(getMultilineEnterPayload(enterEvent("keydown", { ctrlKey: true }))).toBe("\n");
  });

  it("returns null for plain Enter", () => {
    expect(getMultilineEnterPayload(enterEvent("keydown"))).toBeNull();
  });

  it("returns null for keyup and keypress", () => {
    expect(getMultilineEnterPayload(enterEvent("keyup", { shiftKey: true }))).toBeNull();
    expect(getMultilineEnterPayload(enterEvent("keypress", { ctrlKey: true }))).toBeNull();
  });

  it("returns null when alt or meta is held", () => {
    expect(
      getMultilineEnterPayload(enterEvent("keydown", { shiftKey: true, altKey: true })),
    ).toBeNull();
    expect(
      getMultilineEnterPayload(enterEvent("keydown", { ctrlKey: true, metaKey: true })),
    ).toBeNull();
  });
});
