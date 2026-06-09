export type DiffDisplayLineKind = "add" | "remove" | "context";

export interface DiffDisplayLine {
  kind: DiffDisplayLineKind;
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface DiffHunk {
  index: number;
  header: string;
  oldStart: number;
  newStart: number;
  /** File headers (`---` / `+++`) prepended for `git apply`. */
  patchPrefix: string;
  patch: string;
  lines: DiffDisplayLine[];
}

export interface ParsedUnifiedDiff {
  fileHeaders: string[];
  hunks: DiffHunk[];
}

export interface SideBySideCell {
  kind: DiffDisplayLineKind | "empty";
  text: string;
  lineNumber: number | null;
  hunkIndex: number;
  /** Index in the parent hunk's `lines` array; null for padding cells. */
  sourceLineIndex: number | null;
}

export interface SideBySideRow {
  hunkIndex: number;
  left: SideBySideCell;
  right: SideBySideCell;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function parseHunkHeader(line: string): { oldStart: number; newStart: number } | null {
  const match = HUNK_HEADER.exec(line);
  if (!match) return null;
  return {
    oldStart: Number.parseInt(match[1], 10),
    newStart: Number.parseInt(match[3], 10),
  };
}

function isFileHeaderLine(line: string): boolean {
  return (
    line.startsWith("diff --git ") ||
    line.startsWith("index ") ||
    line.startsWith("new file mode ") ||
    line.startsWith("deleted file mode ") ||
    line.startsWith("similarity index ") ||
    line.startsWith("rename from ") ||
    line.startsWith("rename to ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("old mode ") ||
    line.startsWith("new mode ")
  );
}

export function parseUnifiedDiff(content: string): ParsedUnifiedDiff {
  if (!content.trim()) {
    return { fileHeaders: [], hunks: [] };
  }

  const rawLines = content.split("\n");
  const fileHeaders: string[] = [];
  let lineIndex = 0;

  while (lineIndex < rawLines.length) {
    const line = rawLines[lineIndex];
    if (line.startsWith("@@")) break;
    if (line.length === 0) {
      lineIndex += 1;
      continue;
    }
    if (isFileHeaderLine(line)) {
      fileHeaders.push(line);
      lineIndex += 1;
      continue;
    }
    break;
  }

  const applyHeaders = fileHeaders.filter(
    (line) => line.startsWith("--- ") || line.startsWith("+++ "),
  );
  const patchPrefix =
    applyHeaders.length > 0 ? `${applyHeaders.join("\n")}\n` : fileHeaders.length > 0 ? `${fileHeaders.join("\n")}\n` : "";

  const hunks: DiffHunk[] = [];
  let hunkIndex = 0;

  while (lineIndex < rawLines.length) {
    const headerLine = rawLines[lineIndex];
    if (!headerLine.startsWith("@@")) {
      lineIndex += 1;
      continue;
    }

    const headerInfo = parseHunkHeader(headerLine);
    if (!headerInfo) {
      lineIndex += 1;
      continue;
    }

    lineIndex += 1;
    const bodyLines: string[] = [];
    const displayLines: DiffDisplayLine[] = [];
    let oldLine = headerInfo.oldStart;
    let newLine = headerInfo.newStart;

    while (lineIndex < rawLines.length && !rawLines[lineIndex].startsWith("@@")) {
      const text = rawLines[lineIndex];
      if (text.length === 0) {
        lineIndex += 1;
        continue;
      }
      bodyLines.push(text);

      if (text.startsWith("+") && !text.startsWith("+++")) {
        displayLines.push({
          kind: "add",
          text: text.slice(1),
          oldLine: null,
          newLine: newLine,
        });
        newLine += 1;
      } else if (text.startsWith("-") && !text.startsWith("---")) {
        displayLines.push({
          kind: "remove",
          text: text.slice(1),
          oldLine: oldLine,
          newLine: null,
        });
        oldLine += 1;
      } else if (text.startsWith("\\")) {
        displayLines.push({
          kind: "context",
          text: text,
          oldLine: null,
          newLine: null,
        });
      } else {
        const contextText = text.startsWith(" ") ? text.slice(1) : text;
        displayLines.push({
          kind: "context",
          text: contextText,
          oldLine: oldLine,
          newLine: newLine,
        });
        oldLine += 1;
        newLine += 1;
      }

      lineIndex += 1;
    }

    const patchBody = [headerLine, ...bodyLines].join("\n");
    hunks.push({
      index: hunkIndex,
      header: headerLine,
      oldStart: headerInfo.oldStart,
      newStart: headerInfo.newStart,
      patchPrefix,
      patch: `${patchPrefix}${patchBody}${patchBody.endsWith("\n") ? "" : "\n"}`,
      lines: displayLines,
    });
    hunkIndex += 1;
  }

  return { fileHeaders, hunks };
}

function toDiffBodyLine(line: DiffDisplayLine): string {
  switch (line.kind) {
    case "add":
      return `+${line.text}`;
    case "remove":
      return `-${line.text}`;
    default:
      return line.text.startsWith("\\") ? line.text : ` ${line.text}`;
  }
}

function buildHunkHeader(oldStart: number, oldCount: number, newStart: number, newCount: number): string {
  const oldPart = oldCount === 1 ? `${oldStart}` : `${oldStart},${oldCount}`;
  const newPart = newCount === 1 ? `${newStart}` : `${newStart},${newCount}`;
  return `@@ -${oldPart} +${newPart} @@`;
}

/** Minimal apply-ready patch for one changed line (includes its change block + one context line). */
export function buildLinePatch(hunk: DiffHunk, lineIndex: number): string | null {
  const lines = hunk.lines;
  const target = lines[lineIndex];
  if (!target || target.kind === "context") return null;

  let start = lineIndex;
  let end = lineIndex;
  while (start > 0 && lines[start - 1].kind !== "context") start -= 1;
  while (end < lines.length - 1 && lines[end + 1].kind !== "context") end += 1;

  if (start > 0 && lines[start - 1].kind === "context") start -= 1;
  if (end < lines.length - 1 && lines[end + 1].kind === "context") end += 1;

  const slice = lines.slice(start, end + 1);
  const bodyLines = slice.map(toDiffBodyLine);

  let oldStart: number | null = null;
  let newStart: number | null = null;
  let oldCount = 0;
  let newCount = 0;

  for (const line of slice) {
    if (line.kind === "context" || line.kind === "remove") {
      oldCount += 1;
      if (oldStart == null && line.oldLine != null) oldStart = line.oldLine;
    }
    if (line.kind === "context" || line.kind === "add") {
      newCount += 1;
      if (newStart == null && line.newLine != null) newStart = line.newLine;
    }
  }

  if (oldStart == null) oldStart = hunk.oldStart;
  if (newStart == null) newStart = hunk.newStart;

  const header = buildHunkHeader(oldStart, oldCount, newStart, newCount);
  const body = [header, ...bodyLines].join("\n");
  return `${hunk.patchPrefix}${body}\n`;
}

function sideBySideCell(
  hunkIndex: number,
  line: DiffDisplayLine,
  sourceLineIndex: number,
): SideBySideCell {
  return {
    kind: line.kind,
    text: line.text,
    lineNumber: line.kind === "remove" ? line.oldLine : line.newLine,
    hunkIndex,
    sourceLineIndex,
  };
}

function emptySideBySideCell(hunkIndex: number): SideBySideCell {
  return {
    kind: "empty",
    text: "",
    lineNumber: null,
    hunkIndex,
    sourceLineIndex: null,
  };
}

/** Align unified hunk lines into side-by-side rows (VS Code-style). */
export function buildSideBySideRows(hunk: DiffHunk): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  const lines = hunk.lines;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.kind === "context") {
      const cell = sideBySideCell(hunk.index, line, index);
      rows.push({ hunkIndex: hunk.index, left: cell, right: cell });
      index += 1;
      continue;
    }

    if (line.kind === "remove") {
      const next = lines[index + 1];
      if (next?.kind === "add") {
        rows.push({
          hunkIndex: hunk.index,
          left: sideBySideCell(hunk.index, line, index),
          right: sideBySideCell(hunk.index, next, index + 1),
        });
        index += 2;
        continue;
      }
      rows.push({
        hunkIndex: hunk.index,
        left: sideBySideCell(hunk.index, line, index),
        right: emptySideBySideCell(hunk.index),
      });
      index += 1;
      continue;
    }

    rows.push({
      hunkIndex: hunk.index,
      left: emptySideBySideCell(hunk.index),
      right: sideBySideCell(hunk.index, line, index),
    });
    index += 1;
  }

  return rows;
}

export interface UnifiedDiffFileSlice {
  path: string;
  patch: string;
}

/** Split a multi-file unified diff into per-file patches for GitDiffViewer. */
export function splitUnifiedDiffByFile(content: string): UnifiedDiffFileSlice[] {
  if (!content.trim()) return [];

  const lines = content.split("\n");
  const slices: UnifiedDiffFileSlice[] = [];
  let start = -1;
  let path = "";

  const flush = (end: number) => {
    if (start < 0) return;
    const patch = lines.slice(start, end).join("\n").trimEnd();
    if (patch) slices.push({ path, patch: patch.endsWith("\n") ? patch : `${patch}\n` });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.startsWith("diff --git ")) continue;

    flush(i);
    start = i;
    const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    path = match?.[2] ?? match?.[1] ?? line.slice("diff --git ".length);
  }

  flush(lines.length);
  return slices;
}
