import type { Terminal } from "@xterm/xterm";
import { stripAnsiForPrompt } from "./terminalPrompt";

const START_PROMPTS = [
  /^PS\s+[A-Za-z]:\\[^\r\n>]+>\s*/,
  /^[A-Za-z]:\\[^>\r\n]*>\s*/,
  /^(?:\/[\w.-]+)+>\s*/,
  /^[\w.-]+@[\w.-]+:(?:\/[\w.-]+)+[$#]\s*/,
] as const;
const MAX_PROMPT_PREFIX_LEN = 120;

/** Text after the shell prompt on the cursor row (or wrapped block). */
export function extractInputAfterPrompt(line: string): string {
  const stripped = stripAnsiForPrompt(line);

  for (const regex of START_PROMPTS) {
    const match = stripped.match(regex);
    if (match) {
      return stripped.slice(match[0].length).trimEnd();
    }
  }

  const trimmed = stripped.trimEnd();
  for (let i = 0; i < Math.min(trimmed.length, MAX_PROMPT_PREFIX_LEN); i++) {
    const ch = trimmed[i];
    if (ch === ">" || ch === "$" || ch === "#") {
      if (i === trimmed.length - 1 || trimmed[i + 1] === " ") {
        return trimmed.slice(i + 1).trimStart();
      }
    }
  }

  return trimmed.trim();
}

export function readTerminalCurrentInput(terminal: Terminal): string {
  const buffer = terminal.buffer.active;
  const cursorY = buffer.baseY + buffer.cursorY;

  let startY = cursorY;
  while (startY > 0) {
    const line = buffer.getLine(startY);
    if (!line || !line.isWrapped) {
      break;
    }
    startY--;
  }

  let raw = "";
  for (let y = startY; y <= cursorY; y++) {
    const line = buffer.getLine(y);
    if (!line) continue;
    const isCursorLine = y === cursorY;
    const endColumn = isCursorLine
      ? Math.min(buffer.cursorX + 1, line.length + 1)
      : line.length;
    raw += line.translateToString(false, 0, endColumn);
  }

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
