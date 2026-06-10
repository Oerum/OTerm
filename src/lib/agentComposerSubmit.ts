import type { CliAgentId } from "./terminalAgentMode";

export type SubmitStrategy =
  | "inline"
  | "delayedEnter"
  | "bracketedPaste"
  | "bracketedPasteDelayedEnter";

const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";
const DELAYED_ENTER_MS = 50;
const BRACKETED_PASTE_ENTER_DELAY_MS = 300;

export function submitStrategyForAgent(agentId: CliAgentId): SubmitStrategy {
  switch (agentId) {
    case "codex":
      return "bracketedPaste";
    case "copilot":
      return "bracketedPasteDelayedEnter";
    case "claude":
    case "gemini":
    case "opencode":
    case "auggie":
    case "cursor":
      return "delayedEnter";
    default:
      return "inline";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function submitWithStrategy(
  sessionId: string,
  text: string,
  strategy: SubmitStrategy,
  write: (sessionId: string, data: string) => Promise<void>,
): Promise<void> {
  switch (strategy) {
    case "inline":
      await write(sessionId, `${text}\r`);
      return;
    case "delayedEnter":
      await write(sessionId, text);
      await delay(DELAYED_ENTER_MS);
      await write(sessionId, "\r");
      return;
    case "bracketedPaste":
      await write(sessionId, `${BRACKETED_PASTE_START}${text}${BRACKETED_PASTE_END}`);
      await write(sessionId, "\r");
      return;
    case "bracketedPasteDelayedEnter":
      await write(sessionId, `${BRACKETED_PASTE_START}${text}${BRACKETED_PASTE_END}`);
      await delay(BRACKETED_PASTE_ENTER_DELAY_MS);
      await write(sessionId, "\r");
      return;
  }
}

export async function submitTerminalComposerText(
  sessionId: string,
  text: string,
  write: (sessionId: string, data: string) => Promise<void>,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const strategy: SubmitStrategy = trimmed.includes("\n") ? "bracketedPaste" : "inline";
  await submitWithStrategy(sessionId, trimmed, strategy, write);
}

export async function submitAgentComposerText(
  sessionId: string,
  agentId: CliAgentId,
  text: string,
  write: (sessionId: string, data: string) => Promise<void>,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  await submitWithStrategy(sessionId, trimmed, submitStrategyForAgent(agentId), write);
}
