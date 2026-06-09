import { describe, expect, it } from "vitest";
import {
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
