import { afterEach, describe, expect, it } from "vitest";
import { clearAgentComposerDraft, getAgentComposerDraft } from "./agentComposerDrafts";

afterEach(() => clearAgentComposerDraft("pane"));

describe("agent composer drafts", () => {
  it("retains ordinary text attachments and the shared sending lock across recreation", () => {
    const draft = getAgentComposerDraft("pane");
    draft.text = "Unsent user message";
    draft.attachments = ["/image.png"];
    draft.sending = true;
    expect(getAgentComposerDraft("pane")).toBe(draft);
    expect(getAgentComposerDraft("pane")).toEqual({ text: "Unsent user message", attachments: ["/image.png"], sending: true });
  });

  it("cleans up permanently removed pane drafts without reusing an old lock", () => {
    const removed = getAgentComposerDraft("pane");
    removed.text = "old";
    removed.sending = true;
    clearAgentComposerDraft("pane");
    const current = getAgentComposerDraft("pane");
    expect(current).not.toBe(removed);
    expect(current).toEqual({ text: "", attachments: [], sending: false });
  });
});
