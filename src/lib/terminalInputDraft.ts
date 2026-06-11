import { stripAnsiForPrompt } from "./terminalPrompt";

const BACKSPACE = new Set(["\x7f", "\b"]);
const WORD_DELETE = "\x17";
const MAX_RECORDABLE_COMMAND_LEN = 200;

function deleteWordBackward(text: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === " ") end -= 1;
  while (end > 0 && text[end - 1] !== " " && text[end - 1] !== "\t") end -= 1;
  return text.slice(0, end);
}

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
    if (ch === WORD_DELETE) {
      next = deleteWordBackward(next);
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
