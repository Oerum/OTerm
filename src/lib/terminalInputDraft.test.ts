import { describe, expect, it } from "vitest";
import {
  applyTerminalInputDraft,
  isRecordableCommand,
  normalizeSubmittedCommand,
} from "./terminalInputDraft";

describe("normalizeSubmittedCommand", () => {
  it("strips ANSI and control chars from tab-completed input", () => {
    const raw = "\x1b[?25lcd cleanQuote\\CleanQuoteCore\\\r";
    expect(normalizeSubmittedCommand(raw)).toBe("cd cleanQuote\\CleanQuoteCore\\");
  });

  it("keeps plain cd commands", () => {
    expect(normalizeSubmittedCommand("cd desktop\r\n")).toBe("cd desktop");
  });
});

describe("isRecordableCommand", () => {
  it("rejects empty and overlong commands", () => {
    expect(isRecordableCommand("")).toBe(false);
    expect(isRecordableCommand("cd")).toBe(true);
    expect(isRecordableCommand("x".repeat(201))).toBe(false);
  });
});

describe("applyTerminalInputDraft", () => {
  it("deletes the previous word on Ctrl+W", () => {
    expect(applyTerminalInputDraft("npm run build", "\x17")).toBe("npm run ");
  });

  it("still deletes a single character on backspace", () => {
    expect(applyTerminalInputDraft("abc", "\x7f")).toBe("ab");
  });
});
