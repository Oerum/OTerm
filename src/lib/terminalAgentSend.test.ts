import { describe, expect, it, vi } from "vitest";
import { sendTerminalAgentPrompt } from "./terminalAgentSend";
import { BRACKETED_PASTE_END, BRACKETED_PASTE_START } from "./agentComposerSubmit";
import type { SourceControlAgentTarget } from "./sourceControlAgent";

const target: SourceControlAgentTarget = {
  paneId: "pane", sessionId: "session", agentId: "codex", cwd: "/repo", repoRoot: "/repo", scopeKey: "pane:pane",
};
function fixture(expected = target) {
  const events: string[] = [];
  let current: SourceControlAgentTarget | null = expected;
  let pendingInput = "";
  let composerBusy = false;
  const lock = { sending: false };
  const detect = vi.fn(async () => { events.push("check"); return expected.agentId as string | null; });
  const write = vi.fn(async (_sessionId: string, data: string) => { events.push(data === "\r" ? "Enter" : "paste"); });
  const context = { lock, current: () => current, pendingInput: () => pendingInput, composerBusy: () => composerBusy, detect, write };
  return { events, context, lock, detect, write,
    setCurrent: (value: SourceControlAgentTarget | null) => { current = value; },
    setPending: (value: string) => { pendingInput = value; },
    setBusy: () => { composerBusy = true; },
  };
}

describe("native terminal agent submission", () => {
  it.each(["codex", "claude", "agy", "amp"] as const)("checks process before paste and Enter for %s", async (agentId) => {
    const expected = { ...target, agentId };
    const view = fixture(expected);
    await sendTerminalAgentPrompt("Review\nfeedback", expected, view.context);
    expect(view.events).toEqual(["check", "paste", "check", "Enter"]);
    expect(view.write.mock.calls).toEqual([
      [target.sessionId, `${BRACKETED_PASTE_START}Review\nfeedback${BRACKETED_PASTE_END}`],
      [target.sessionId, "\r"],
    ]);
    expect(view.lock.sending).toBe(false);
  });

  it("rechecks a delayed Copilot submission before Enter", async () => {
    vi.useFakeTimers();
    try {
      const expected = { ...target, agentId: "copilot" as const };
      const view = fixture(expected);
      const sending = sendTerminalAgentPrompt("Review\nfeedback", expected, view.context);
      await vi.advanceTimersByTimeAsync(0);
      expect(view.events).toEqual(["check", "paste"]);
      expect(view.lock.sending).toBe(true);
      await vi.advanceTimersByTimeAsync(300);
      await sending;
      expect(view.events).toEqual(["check", "paste", "check", "Enter"]);
      expect(view.lock.sending).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it("rejects empty text, known pending input, dictation and another send without writes", async () => {
    for (const reason of ["empty", "input", "dictation", "sending"]) {
      const view = fixture();
      if (reason === "input") view.setPending("unfinished native input");
      if (reason === "dictation") view.setBusy();
      if (reason === "sending") view.lock.sending = true;
      await expect(sendTerminalAgentPrompt(reason === "empty" ? " " : "Feedback", target, view.context)).rejects.toThrow("Could not send");
      expect(view.write, reason).not.toHaveBeenCalled();
      expect(view.detect, reason).not.toHaveBeenCalled();
      expect(view.lock.sending, reason).toBe(reason === "sending");
    }
  });

  it("rejects an initially stale target without querying or writing", async () => {
    const view = fixture();
    view.setCurrent(null);
    await expect(sendTerminalAgentPrompt("Feedback", target, view.context)).rejects.toThrow("changed");
    expect(view.detect).not.toHaveBeenCalled();
    expect(view.write).not.toHaveBeenCalled();
    expect(view.lock.sending).toBe(false);
  });

  it.each([null, "claude", "unknown"])("does not write when fresh detection returns %s", async (detected) => {
    const view = fixture();
    view.detect.mockResolvedValueOnce(detected);
    await expect(sendTerminalAgentPrompt("Feedback", target, view.context)).rejects.toThrow("Could not send");
    expect(view.write).not.toHaveBeenCalled();
    expect(view.lock.sending).toBe(false);
  });

  it("releases the lock when fresh process detection fails", async () => {
    const view = fixture();
    view.detect.mockRejectedValueOnce(new Error("Process query failed"));
    await expect(sendTerminalAgentPrompt("Feedback", target, view.context)).rejects.toThrow("Could not send");
    expect(view.write).not.toHaveBeenCalled();
    expect(view.lock.sending).toBe(false);
  });

  it("rejects target changes and newly typed input during awaited detection", async () => {
    for (const change of ["pane", "session", "agent", "cwd", "root", "input"]) {
      const view = fixture();
      view.detect.mockImplementationOnce(async () => {
        if (change === "input") view.setPending("new typed input");
        else view.setCurrent({ ...target, [({ pane: "paneId", session: "sessionId", agent: "agentId", cwd: "cwd", root: "repoRoot" } as const)[change as "pane" | "session" | "agent" | "cwd" | "root"]]: "changed" });
        return target.agentId;
      });
      await expect(sendTerminalAgentPrompt("Feedback", target, view.context), change).rejects.toThrow("Could not send");
      expect(view.write, change).not.toHaveBeenCalled();
      expect(view.lock.sending, change).toBe(false);
    }
  });

  it("does not send Enter after the agent disappears and warns that paste may already be present", async () => {
    const view = fixture();
    view.detect.mockResolvedValueOnce("codex").mockResolvedValueOnce(null);
    await expect(sendTerminalAgentPrompt("Review\nfeedback", target, view.context)).rejects.toThrow("Input may already be present or sent");
    expect(view.write).toHaveBeenCalledOnce();
    expect(view.write.mock.calls[0][1]).not.toBe("\r");
    expect(view.lock.sending).toBe(false);
  });

  it("treats a rejected first IPC write as potentially partial and never retries", async () => {
    const view = fixture();
    view.write.mockRejectedValueOnce(new Error("IPC failed"));
    await expect(sendTerminalAgentPrompt("Review\nfeedback", target, view.context)).rejects.toThrow("Inspect that terminal before retrying");
    expect(view.write).toHaveBeenCalledOnce();
    expect(view.lock.sending).toBe(false);
  });
});
