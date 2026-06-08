const BACKSPACE = new Set(["\x7f", "\b"]);

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
