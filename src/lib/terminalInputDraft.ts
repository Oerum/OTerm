import { stripAnsiForPrompt } from "./terminalPrompt";

const BACKSPACE = new Set(["\x7f", "\b"]);
const MAX_RECORDABLE_COMMAND_LEN = 200;

export function normalizeSubmittedCommand(raw: string): string {
  return stripAnsiForPrompt(raw).replace(/\x07/g, "").replace(/[\r\n]+/g, "").trim();
}

export function isRecordableCommand(command: string): boolean {
  return command.length > 0 && command.length <= MAX_RECORDABLE_COMMAND_LEN;
}

export function applyTerminalInputDraft(draft: string, data: string): string {
  let next = draft;
  for (const ch of data) {
    if (ch === "\r" || ch === "\n") {
      return "";
    }
    if (BACKSPACE.has(ch)) {
      next = next.slice(0, -1);
      continue;
    }
    if (ch === "\x03" || ch === "\x1b") {
      return "";
    }
    if (ch < " " && ch !== "\t") continue;
    next += ch;
  }
  return next;
}
