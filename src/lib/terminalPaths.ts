import type { Terminal } from "@xterm/xterm";
import { detectShellPrompt, stripAnsiForPrompt } from "./terminalPrompt";

export interface PathMatch {
  start: number;
  end: number;
  text: string;
}

export interface XtermLinkRange {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/** Convert a 0-based path match to xterm's 1-based IBufferCellPosition link range. */
export function pathMatchToLinkRange(
  match: PathMatch,
  bufferLineNumber: number,
): XtermLinkRange {
  return {
    start: { x: match.start + 1, y: bufferLineNumber },
    end: { x: match.end, y: bufferLineNumber },
  };
}

const TRAILING_TRIM = /[.,;:)}\]'"]+$/;
const LINE_COL_SUFFIX = /\(\d+(?:,\d+)?\)?/;
const HTTP_URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;

export function isHttpUrl(text: string): boolean {
  return /^https?:\/\//i.test(text);
}

const PATTERNS: RegExp[] = [
  // Quoted Windows paths
  /"(?:[A-Za-z]:\\[^"]+|\\\\[^"]+)"/g,
  // Quoted Unix paths
  /'(?:\/[^']+|~\/[^']+)'/g,
  // UNC paths
  /\\\\[^\s"'<>|$#\\]+\\[^\s"'<>|$#]+(?:\\[^\s"'<>|$#]+)*/g,
  // Windows drive paths
  /[A-Za-z]:[/\\][^\s"'<>|$#]+(?:[/\\][^\s"'<>|$#]+)*/g,
  // Relative ./ paths (rg/find)
  /\.\/[\w./-]+/g,
  // Unix absolute paths (at least /segment)
  /\/[\w.-]+(?:\/[\w.-]+)*/g,
  // Home-relative paths
  /~\/[\w./-]+/g,
];

function trimPathEdges(raw: string): string {
  let text = raw;
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1);
  }
  const parenIdx = text.search(LINE_COL_SUFFIX);
  if (parenIdx > 0) {
    text = text.slice(0, parenIdx);
  }
  return text.replace(TRAILING_TRIM, "").replace(/[>$#]$/, "");
}

function isValidPath(text: string, start = 0, source = text): boolean {
  if (text.length < 2) return false;
  if (/^[A-Za-z]:$/.test(text)) return false;
  if (/^[A-Za-z]:\/\//.test(text)) return false;
  if (text.startsWith("http://") || text.startsWith("https://")) return false;
  if (text.startsWith("/") && start > 0 && source[start - 1] === ":") return false;
  return true;
}

function mergeOverlapping(matches: PathMatch[]): PathMatch[] {
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: PathMatch[] = [];
  for (const match of sorted) {
    const last = merged[merged.length - 1];
    if (last && match.start < last.end) continue;
    merged.push({ ...match });
  }
  return merged;
}

/** Scan a single terminal line for file-system paths. Paths split across wrapped lines are not linked (v1). */
export function scanLineForPaths(line: string): PathMatch[] {
  const text = stripAnsiForPrompt(line);
  const trimmed = text.trim();
  if (!trimmed || detectShellPrompt(trimmed)) return [];

  const matches: PathMatch[] = [];
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[0];
      if (raw.startsWith("/") && text.slice(Math.max(0, match.index - 6), match.index + raw.length).includes("://")) {
        continue;
      }
      const pathText = trimPathEdges(raw);
      if (!isValidPath(pathText, match.index, text)) continue;
      const quoted =
        (raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'"));
      const start = match.index + (quoted ? 1 : 0);
      const end = start + pathText.length;
      matches.push({ start, end, text: pathText });
    }
  }

  return mergeOverlapping(matches);
}

/** Scan a single terminal line for http(s) URLs. */
export function scanLineForUrls(line: string): PathMatch[] {
  const text = stripAnsiForPrompt(line);
  const trimmed = text.trim();
  if (!trimmed || detectShellPrompt(trimmed)) return [];

  const matches: PathMatch[] = [];
  HTTP_URL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HTTP_URL_PATTERN.exec(text)) !== null) {
    const raw = match[0];
    const urlText = trimPathEdges(raw);
    if (!isHttpUrl(urlText)) continue;
    matches.push({
      start: match.index,
      end: match.index + urlText.length,
      text: urlText,
    });
  }

  return mergeOverlapping(matches);
}

export function scanLineForTerminalLinks(line: string): PathMatch[] {
  return mergeOverlapping([...scanLineForPaths(line), ...scanLineForUrls(line)]);
}

export function findPathAtColumn(line: string, col: number): PathMatch | null {
  for (const path of scanLineForPaths(line)) {
    if (col >= path.start && col < path.end) return path;
  }
  return null;
}

export function findLinkAtColumn(line: string, col: number): PathMatch | null {
  for (const link of scanLineForTerminalLinks(line)) {
    if (col >= link.start && col < link.end) return link;
  }
  return null;
}

interface XtermRenderCore {
  _renderService?: {
    dimensions?: {
      css?: { cell?: { width?: number; height?: number } };
    };
  };
}

/** Map a mouse event to absolute buffer row/col coordinates. */
export function getBufferCoordsFromMouseEvent(
  terminal: Terminal,
  event: MouseEvent,
): { col: number; row: number } | null {
  const element = terminal.element;
  if (!element) return null;

  const screen = element.querySelector(".xterm-screen");
  if (!screen) return null;

  const core = (terminal as unknown as { _core?: XtermRenderCore })._core;
  const cell = core?._renderService?.dimensions?.css?.cell;
  if (!cell?.width || !cell?.height) return null;

  const screenRect = screen.getBoundingClientRect();
  const viewport = element.querySelector(".xterm-viewport");
  const scrollTop = viewport?.scrollTop ?? 0;

  const col = Math.floor((event.clientX - screenRect.left) / cell.width);
  const row = Math.floor((event.clientY - screenRect.top + scrollTop) / cell.height);
  const bufferRow = row + terminal.buffer.active.viewportY;

  if (col < 0 || row < 0 || bufferRow < 0 || bufferRow >= terminal.buffer.active.length) {
    return null;
  }

  return { col, row: bufferRow };
}

export function findPathAtMouseEvent(
  terminal: Terminal,
  event: MouseEvent,
): PathMatch | null {
  const coords = getBufferCoordsFromMouseEvent(terminal, event);
  if (!coords) return null;

  const line = terminal.buffer.active.getLine(coords.row);
  if (!line) return null;

  return findPathAtColumn(line.translateToString(false), coords.col);
}

export function findTerminalLinkAtMouseEvent(
  terminal: Terminal,
  event: MouseEvent,
): PathMatch | null {
  const coords = getBufferCoordsFromMouseEvent(terminal, event);
  if (!coords) return null;

  const line = terminal.buffer.active.getLine(coords.row);
  if (!line) return null;

  return findLinkAtColumn(line.translateToString(false), coords.col);
}
