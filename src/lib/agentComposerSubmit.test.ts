import { describe, expect, it, vi } from "vitest";
import { formatAgentComposerMessage } from "./agentComposerAttachments";
import {
  submitAgentComposerText,
  submitStrategyForAgent,
  submitTerminalComposerText,
} from "./agentComposerSubmit";

describe("submitStrategyForAgent", () => {
  it("maps cursor to delayedEnter", () => {
    expect(submitStrategyForAgent("cursor")).toBe("delayedEnter");
  });

  it("maps codex to bracketedPaste", () => {
    expect(submitStrategyForAgent("codex")).toBe("bracketedPaste");
  });

  it("maps copilot to bracketedPasteDelayedEnter", () => {
    expect(submitStrategyForAgent("copilot")).toBe("bracketedPasteDelayedEnter");
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

  it("uses delayedEnter for cursor", async () => {
    vi.useFakeTimers();
    const write = vi.fn().mockResolvedValue(undefined);
    const promise = submitAgentComposerText("sess", "cursor", "hello", write);
    await vi.runAllTimersAsync();
    await promise;

    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[0]).toEqual(["sess", "hello"]);
    expect(write.mock.calls[1]).toEqual(["sess", "\r"]);
    vi.useRealTimers();
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

  it("submits multiline text with attachment paths using delayedEnter", async () => {
    vi.useFakeTimers();
    const write = vi.fn().mockResolvedValue(undefined);
    const payload = formatAgentComposerMessage("fix this logo", [
      "C:\\Users\\Filip\\Pictures\\shot.png",
      "D:\\clips\\demo.mp4",
    ]);
    const promise = submitAgentComposerText("sess", "cursor", payload, write);
    await vi.runAllTimersAsync();
    await promise;

    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[0][1]).toBe(
      "fix this logo\nC:\\Users\\Filip\\Pictures\\shot.png\nD:\\clips\\demo.mp4",
    );
    expect(write.mock.calls[1][1]).toBe("\r");
    vi.useRealTimers();
  });
});
