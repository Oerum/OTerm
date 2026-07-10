import type { IBufferCell, IBufferLine, Terminal } from "@xterm/xterm";
import { rawIndexForStrippedIndex, stripAnsiForPrompt } from "./terminalPrompt";

const START_PROMPT_PREFIXES = [
  /^PS\s+[A-Za-z]:\\[^\r\n>]+>\s*/,
  /^[A-Za-z]:\\[^>\r\n]*>\s*/,
  /^(?:\/[\w.-]+)+>\s*/,
  /^[\w.-]+@[\w.-]+:(?:\/[\w.-]+)+[$#]\s*/,
] as const;

const START_PROMPTS = START_PROMPT_PREFIXES;
const MAX_PROMPT_PREFIX_LEN = 120;
const MUTED_PALETTE_MIN = 238;
const MUTED_PALETTE_MAX = 252;

/** Shell inline suggestions (fish/zsh/PSReadLine) often use dim, italic, or muted palette fg. */
export function isGhostSuggestionCell(cell: IBufferCell): boolean {
  const isDim = typeof cell.isDim === "function" && Boolean(cell.isDim());
  const isItalic = typeof cell.isItalic === "function" && Boolean(cell.isItalic());
  if (isDim || isItalic) return true;

  if (typeof cell.isFgPalette === "function" && cell.isFgPalette()) {
    const fg = typeof cell.getFgColor === "function" ? cell.getFgColor() : 0;
    if (fg >= MUTED_PALETTE_MIN && fg <= MUTED_PALETTE_MAX) return true;
  }
  return false;
}

function strippedPromptOffset(lineText: string): { stripped: string; trimOffset: number; trimmed: string } {
  const stripped = stripAnsiForPrompt(lineText);
  const trimmed = stripped.trimStart();
  return { stripped, trimOffset: stripped.length - trimmed.length, trimmed };
}

/** Column where typed command text starts on a prompt line (0-based buffer column). */
export function commandColumnOnLine(lineText: string, command: string): number {
  const { trimmed, trimOffset } = strippedPromptOffset(lineText);
  const cmd = command.trim();
  if (!cmd) return 0;

  let strippedIndex = trimOffset;
  const input = extractInputAfterPrompt(trimmed);
  if (input) {
    const inputStart = trimmed.length - input.length;
    const offsetInInput = input.indexOf(cmd);
    if (offsetInInput >= 0) {
      strippedIndex = trimOffset + inputStart + offsetInInput;
    }
  } else {
    const index = trimmed.indexOf(cmd);
    strippedIndex = index >= 0 ? trimOffset + index : trimOffset;
  }

  return rawIndexForStrippedIndex(lineText, strippedIndex);
}

/** Buffer column where typed input begins — works even before PTY echo catches up. */
export function commandInputStartColumn(lineText: string): number | null {
  const { trimmed, trimOffset } = strippedPromptOffset(lineText);

  for (const regex of START_PROMPT_PREFIXES) {
    const match = trimmed.match(regex);
    if (match) {
      return rawIndexForStrippedIndex(lineText, trimOffset + match[0].length);
    }
  }

  const cmdTail = trimmed.match(/^[A-Za-z]:\\[^>\r\n]*>/);
  if (cmdTail) {
    return rawIndexForStrippedIndex(lineText, trimOffset + cmdTail[0].length);
  }

  return null;
}

/** Column for live input: prefer echoed text, else anchor after the shell prompt. */
export function resolveActiveCommandColumn(lineText: string, command: string): number {
  const cmd = command.trim();
  if (!cmd) return 0;

  const stripped = stripAnsiForPrompt(lineText).trimStart();
  if (stripped.includes(cmd)) {
    return commandColumnOnLine(lineText, cmd);
  }

  return commandInputStartColumn(lineText) ?? 0;
}

/** Text after the shell prompt on the cursor row (or wrapped block). */
export function extractInputAfterPrompt(line: string): string {
  const stripped = stripAnsiForPrompt(line).trimStart();

  for (const regex of START_PROMPTS) {
    const match = stripped.match(regex);
    if (match) {
      return stripped.slice(match[0].length).trimEnd();
    }
  }

  const trimmed = stripped.trimEnd();
  for (let i = 0; i < Math.min(trimmed.length, MAX_PROMPT_PREFIX_LEN); i++) {
    const ch = trimmed[i];
    if (ch === ">") {
      return trimmed.slice(i + 1).trimStart();
    }
    if (ch === "$" || ch === "#") {
      if (i === trimmed.length - 1 || trimmed[i + 1] === " ") {
        return trimmed.slice(i + 1).trimStart();
      }
    }
  }

  return trimmed.trim();
}

function readLineToString(
  line: IBufferLine,
  endColumn: number,
  stopAtGhost: boolean,
): string {
  let raw = "";
  for (let x = 0; x < endColumn; x++) {
    const current = line.getCell(x);
    if (!current) break;
    if (stopAtGhost && isGhostSuggestionCell(current)) break;
    raw += current.getChars();
  }
  return raw;
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
      ? Math.min(buffer.cursorX + 1, line.length)
      : line.length;
    raw += readLineToString(line, endColumn, isCursorLine);
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

/** Typed input only — ignores shell ghost suggestions that may inflate the buffer read. */
export function resolveTerminalAutocompleteInput(
  terminal: Terminal | null,
  draftFallback: string,
): string {
  const fromDraft = draftFallback.trim();
  if (fromDraft) return fromDraft;
  return terminal ? readTerminalCurrentInput(terminal).trim() : "";
}

const PROMPT_LINE_HINT =
  /PS\s+[A-Za-z]:\\|[A-Za-z]:\\[^>\r\n]*>|[\w.-]+@[\w.-]+:[^\r\n]+[$#]|(?:\/[\w.-]+)+>/;

/** Infer the most recent command block from scrollback when keystroke capture missed it. */
export function inferLastCommandBlock(
  terminal: Terminal,
  promptLine?: number,
): { command: string; commandLine: number; endLine: number } | null {
  const buffer = terminal.buffer.active;
  const cursorLine = promptLine ?? buffer.baseY + buffer.cursorY;

  let endLine = cursorLine - 1;
  while (endLine >= 0) {
    const text = buffer.getLine(endLine)?.translateToString(true) ?? "";
    if (text.trim()) break;
    endLine -= 1;
  }
  if (endLine < 0) return null;

  for (let line = endLine; line >= Math.max(0, endLine - 200); line -= 1) {
    const raw = buffer.getLine(line)?.translateToString(false) ?? "";
    const command = extractInputAfterPrompt(raw);
    if (!command) continue;
    const plain = stripAnsiForPrompt(raw);
    if (!PROMPT_LINE_HINT.test(plain)) continue;
    return { command, commandLine: line, endLine };
  }

  return null;
}
