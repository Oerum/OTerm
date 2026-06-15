import { describe, expect, it, vi } from "vitest";
import { formatAgentComposerMessage } from "./agentComposerAttachments";
import {
  agentSupportsNativeClipboardImagePaste,
  BRACKETED_PASTE_END,
  BRACKETED_PASTE_START,
  insertAgentPromptText,
  submitAgentComposerText,
  submitStrategyForAgent,
  submitTerminalComposerText,
  triggerAgentNativeClipboardPaste,
} from "./agentComposerSubmit";

describe("submitStrategyForAgent", () => {
  it("maps cursor to bracketedPaste", () => {
    expect(submitStrategyForAgent("cursor")).toBe("bracketedPaste");
  });

  it("maps codex to bracketedPaste", () => {
    expect(submitStrategyForAgent("codex")).toBe("bracketedPaste");
  });

  it("maps copilot to bracketedPasteDelayedEnter", () => {
    expect(submitStrategyForAgent("copilot")).toBe("bracketedPasteDelayedEnter");
  });

  it("maps agy to bracketedPaste", () => {
    expect(submitStrategyForAgent("agy")).toBe("bracketedPaste");
  });

  it("defaults unknown agents to inline", () => {
    expect(submitStrategyForAgent("amp")).toBe("inline");
  });
});

describe("submitAgentComposerText", () => {
  it("skips empty submissions", async () => {
    const write = vi.fn();
    await submitAgentComposerText("sess", "cursor", "   ", write);
    expect(write).not.toHaveBeenCalled();
  });

  it("uses bracketedPaste for cursor", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    await submitAgentComposerText("sess", "cursor", "hello", write);

    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[0][1]).toBe("\x1b[200~hello\x1b[201~");
    expect(write.mock.calls[1][1]).toBe("\r");
  });

  it("uses bracketed paste for codex", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    await submitAgentComposerText("sess", "codex", "run tests", write);

    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[0][1]).toBe("\x1b[200~run tests\x1b[201~");
    expect(write.mock.calls[1][1]).toBe("\r");
  });

  it("uses inline strategy by default", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    await submitAgentComposerText("sess", "amp", "status", write);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][1]).toBe("status\r");
  });

  it("submits single-line text inline to terminal", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    await submitTerminalComposerText("sess", "npm test", write);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][1]).toBe("npm test\r");
  });

  it("submits multiline text to terminal with bracketed paste", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    await submitTerminalComposerText("sess", "line one\nline two", write);

    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[0][1]).toBe("\x1b[200~line one\nline two\x1b[201~");
    expect(write.mock.calls[1][1]).toBe("\r");
  });

  it("submits multiline text with attachment paths using bracketedPaste", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const payload = formatAgentComposerMessage("fix this logo", [
      "C:\\Users\\Filip\\Pictures\\shot.png",
      "D:\\clips\\demo.mp4",
    ]);
    await submitAgentComposerText("sess", "cursor", payload, write);

    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[0][1]).toBe(
      `${BRACKETED_PASTE_START}fix this logo\nC:\\Users\\Filip\\Pictures\\shot.png\nD:\\clips\\demo.mp4${BRACKETED_PASTE_END}`,
    );
    expect(write.mock.calls[1][1]).toBe("\r");
  });
});

describe("insertAgentPromptText", () => {
  it("skips empty insertions", async () => {
    const write = vi.fn();
    await insertAgentPromptText("sess", "gemini", "   ", write);
    expect(write).not.toHaveBeenCalled();
  });

  it("writes simple paths without enter", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    await insertAgentPromptText("sess", "gemini", "C:\\tmp\\shot.png", write);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]).toEqual(["sess", "C:\\tmp\\shot.png"]);
  });

  it("uses bracketed paste for paths with spaces", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    await insertAgentPromptText(
      "sess",
      "gemini",
      "C:\\Users\\Filip Pictures\\shot.png",
      write,
    );

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][1]).toBe(
      `${BRACKETED_PASTE_START}C:\\Users\\Filip Pictures\\shot.png${BRACKETED_PASTE_END}`,
    );
  });
});

describe("triggerAgentNativeClipboardPaste", () => {
  it("sends an empty bracketed paste sequence", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    await triggerAgentNativeClipboardPaste("sess", write);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][1]).toBe(`${BRACKETED_PASTE_START}${BRACKETED_PASTE_END}`);
  });
});

describe("agentSupportsNativeClipboardImagePaste", () => {
  it("enables native clipboard fallback for gemini", () => {
    expect(agentSupportsNativeClipboardImagePaste("gemini")).toBe(true);
    expect(agentSupportsNativeClipboardImagePaste("cursor")).toBe(false);
  });
});
