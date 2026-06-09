import type { Terminal } from "@xterm/xterm";
import { stripAnsiForPrompt } from "./terminalPrompt";

const PROMPT_DELIMITERS = [">", "$", "#"] as const;
const MAX_PROMPT_PREFIX_LEN = 120;

/** Text after the shell prompt on the cursor row. */
export function extractInputAfterPrompt(line: string): string {
  const stripped = stripAnsiForPrompt(line).trimEnd();
  let bestIdx = -1;
  for (const delimiter of PROMPT_DELIMITERS) {
    const idx = stripped.lastIndexOf(delimiter);
    if (idx > bestIdx && idx < MAX_PROMPT_PREFIX_LEN) {
      bestIdx = idx;
    }
  }
  if (bestIdx >= 0) {
    return stripped.slice(bestIdx + 1).trimStart();
  }
  return stripped.trim();
}

export function readTerminalCurrentInput(terminal: Terminal): string {
  const buffer = terminal.buffer.active;
  const line = buffer.getLine(buffer.baseY + buffer.cursorY);
  if (!line) return "";
  // endColumn is exclusive; +1 includes the cell at cursorX when the cursor sits on a character.
  const endColumn = Math.min(buffer.cursorX + 1, line.length + 1);
  const raw = line.translateToString(false, 0, endColumn);
  return extractInputAfterPrompt(raw);
}

/** Merge xterm buffer text with the local keystroke draft (echo can lag; shell can complete ahead). */
export function mergeTerminalDraftSources(fromBuffer: string, fromDraft: string): string {
  if (!fromBuffer) return fromDraft;
  if (!fromDraft) return fromBuffer;
  if (fromBuffer === fromDraft) return fromBuffer;
  if (fromBuffer.startsWith(fromDraft)) return fromBuffer;
  if (fromDraft.startsWith(fromBuffer)) return fromDraft;
  return fromDraft.length >= fromBuffer.length ? fromDraft : fromBuffer;
}

export function resolveTerminalDraftInput(
  terminal: Terminal | null,
  draftFallback: string,
): string {
  const fromBuffer = terminal ? readTerminalCurrentInput(terminal).trim() : "";
  const fromDraft = draftFallback.trim();
  return mergeTerminalDraftSources(fromBuffer, fromDraft);
}
