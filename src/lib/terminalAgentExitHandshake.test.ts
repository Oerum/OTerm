import { describe, expect, it } from "vitest";
import { applyAgentExitHandshakeFromOutput } from "./terminalAgentExitHandshake";

describe("applyAgentExitHandshakeFromOutput", () => {
  it("sets exit confirm pending before prompt-based badge clear", () => {
    const chunk =
      "Press Ctrl+D again to exit\r\nPS C:\\Users\\Filip\\Desktop\\oterm> ";

    const next = applyAgentExitHandshakeFromOutput(chunk, {
      activeAgentId: "agy",
      agentExitConfirmPending: false,
    });

    expect(next.agentExitConfirmPending).toBe(true);
    expect(next.activeAgentId).toBe("agy");
  });

  it("clears active agent on trailing shell prompt when exit confirm is not pending", () => {
    const next = applyAgentExitHandshakeFromOutput("PS C:\\dev> ", {
      activeAgentId: "cursor",
      agentExitConfirmPending: false,
      promptClearSuppressUntil: 0,
    });

    expect(next.activeAgentId).toBeNull();
    expect(next.agentExitConfirmPending).toBe(false);
    expect(next.trailingPrompt).toEqual({ cwd: "C:\\dev" });
  });

  it("does not clear exit confirm pending when a shell prompt appears mid-handshake", () => {
    const next = applyAgentExitHandshakeFromOutput("PS C:\\dev> ", {
      activeAgentId: "agy",
      agentExitConfirmPending: true,
    });

    expect(next.activeAgentId).toBe("agy");
    expect(next.agentExitConfirmPending).toBe(true);
  });

  it("keeps the badge during agy screen refresh with an embedded shell prompt", () => {
    const chunk = "\x1b[2J\x1b[H\r\nPS C:\\Users\\Filip\\Desktop\\oterm> ";

    const next = applyAgentExitHandshakeFromOutput(chunk, {
      activeAgentId: "agy",
      agentExitConfirmPending: false,
    });

    expect(next.activeAgentId).toBe("agy");
    expect(next.trailingPrompt).toEqual({
      cwd: "C:\\Users\\Filip\\Desktop\\oterm",
    });
  });

  it("clears agy after a real return-to-shell prompt", () => {
    const next = applyAgentExitHandshakeFromOutput("PS C:\\Users\\Filip\\Desktop\\oterm> ", {
      activeAgentId: "agy",
      agentExitConfirmPending: false,
      promptClearSuppressUntil: 0,
    });

    expect(next.activeAgentId).toBeNull();
  });

  it("keeps copilot badge during startup shell prompt inside launch suppress window", () => {
    const chunk =
      "Welcome to GitHub Copilot\r\nPS C:\\Users\\Filip\\Desktop\\oterm> ";

    const next = applyAgentExitHandshakeFromOutput(chunk, {
      activeAgentId: "copilot",
      agentExitConfirmPending: false,
      promptClearSuppressUntil: Date.now() + 5000,
    });

    expect(next.activeAgentId).toBe("copilot");
    expect(next.trailingPrompt).toEqual({
      cwd: "C:\\Users\\Filip\\Desktop\\oterm",
    });
  });

  it("clears copilot after return-to-shell once launch suppress window expired", () => {
    const chunk = "PS C:\\Users\\Filip\\Desktop\\oterm> ";

    const next = applyAgentExitHandshakeFromOutput(chunk, {
      activeAgentId: "copilot",
      agentExitConfirmPending: false,
      promptClearSuppressUntil: Date.now() - 1000,
    });

    expect(next.activeAgentId).toBeNull();
    expect(next.trailingPrompt).toEqual({
      cwd: "C:\\Users\\Filip\\Desktop\\oterm",
    });
  });
});
