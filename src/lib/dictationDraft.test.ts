import { describe, expect, it } from "vitest";
import { appendTranscriptionToDraft, applyLiveDictationToDraft } from "./dictationDraft";

describe("appendTranscriptionToDraft", () => {
  it("returns transcription when draft is empty", () => {
    expect(appendTranscriptionToDraft("", "hello world")).toBe("hello world");
    expect(appendTranscriptionToDraft("   ", "hello world")).toBe("hello world");
  });

  it("returns existing draft when transcription is empty", () => {
    expect(appendTranscriptionToDraft("draft", "")).toBe("draft");
    expect(appendTranscriptionToDraft("draft", "   ")).toBe("draft");
  });

  it("joins draft and transcription with a space", () => {
    expect(appendTranscriptionToDraft("fix bug", "in composer")).toBe(
      "fix bug in composer",
    );
  });

  it("preserves draft content when appending", () => {
    expect(appendTranscriptionToDraft("line one", "line two")).toBe(
      "line one line two",
    );
  });
});

describe("applyLiveDictationToDraft", () => {
  it("merges frozen base draft with partial transcription", () => {
    expect(applyLiveDictationToDraft("hello", "world")).toBe("hello world");
    expect(applyLiveDictationToDraft("  hello  ", "  world  ")).toBe("  hello world");
  });

  it("returns base when partial is empty", () => {
    expect(applyLiveDictationToDraft("hello", "")).toBe("hello");
  });
});
