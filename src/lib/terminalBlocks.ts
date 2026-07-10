export type TerminalBlockStatus = "running" | "success" | "failure";

export type TerminalBlock = {
  id: number;
  command: string;
  cwd: string | null;
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  status: TerminalBlockStatus;
  startMarkerLine: number | null;
  commandMarkerLine: number | null;
  endMarkerLine: number | null;
  outputText: string;
  oscFinished: boolean;
};

export type Osc133Event =
  | { kind: "prompt-start" }
  | { kind: "prompt-end" }
  | { kind: "command-start" }
  | { kind: "command-finish"; exitCode: number }
  | { kind: "cwd"; path: string };

let nextBlockId = 1;

export function createTerminalBlock(command = ""): TerminalBlock {
  return {
    id: nextBlockId++,
    command,
    cwd: null,
    startedAt: Date.now(),
    finishedAt: null,
    exitCode: null,
    status: "running",
    startMarkerLine: null,
    commandMarkerLine: null,
    endMarkerLine: null,
    outputText: "",
    oscFinished: false,
  };
}

export function parseOsc133Payload(payload: string): Osc133Event | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;
  const semi = trimmed.indexOf(";");
  const code = semi === -1 ? trimmed : trimmed.slice(0, semi);
  const rest = semi === -1 ? "" : trimmed.slice(semi + 1);

  switch (code) {
    case "A":
      return { kind: "prompt-start" };
    case "B":
      return { kind: "prompt-end" };
    case "C":
      return { kind: "command-start" };
    case "D": {
      const exitCode = Number.parseInt(rest.split(";")[0] ?? "0", 10);
      return { kind: "command-finish", exitCode: Number.isFinite(exitCode) ? exitCode : 0 };
    }
    default:
      return null;
  }
}

export function parseOsc7Payload(payload: string): string | null {
  const trimmed = payload.trim();
  if (!trimmed.startsWith("file://")) return null;
  try {
    const url = new URL(trimmed);
    let path = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
    return path.replace(/\//g, "\\").includes(":") ? path.replace(/\//g, "\\") : path;
  } catch {
    return null;
  }
}

export function stripOutputForHeuristic(text: string): string {
  return text
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "");
}

/** Mirrors __oterm_exit_code in oterm.ps1 for tests. */
export function derivePowerShellExitCode(lastExitCode: number | null, success: boolean): number {
  if (!success) {
    return lastExitCode !== null && lastExitCode !== 0 ? lastExitCode : 1;
  }
  return lastExitCode ?? 0;
}

export function looksLikePowerShellFailure(output: string): boolean {
  const text = stripOutputForHeuristic(output);
  return (
    /is not recognized as a name of a cmdlet/i.test(text) ||
    /CommandNotFoundException/i.test(text) ||
    /The term '.*' is not recognized/i.test(text) ||
    /ParserError:/i.test(text) ||
    /FullyQualifiedErrorId\s*:\s*CommandNotFoundException/i.test(text)
  );
}

export function looksLikeCmdFailure(output: string): boolean {
  const text = stripOutputForHeuristic(output);
  return (
    /is not recognized as an internal or external command/i.test(text) ||
    /The system cannot find the file specified/i.test(text)
  );
}

export function resolveBlockExitCode(
  output: string,
  oscExitCode: number | null,
  shellId?: string | null,
): number {
  const id = shellId?.trim() ?? "";
  const heuristicFailure =
    (id === "pwsh" || id === "powershell") && looksLikePowerShellFailure(output)
      ? true
      : id === "cmd" && looksLikeCmdFailure(output);

  if (heuristicFailure) {
    return oscExitCode !== null && oscExitCode !== 0 ? oscExitCode : 1;
  }
  if (oscExitCode !== null) return oscExitCode;
  return 0;
}

export function finishTerminalBlock(block: TerminalBlock, exitCode: number): TerminalBlock {
  return {
    ...block,
    finishedAt: Date.now(),
    exitCode,
    status: exitCode === 0 ? "success" : "failure",
    oscFinished: true,
  };
}

export function formatBlockDuration(block: TerminalBlock): string {
  const end = block.finishedAt ?? Date.now();
  const seconds = Math.max(0, (end - block.startedAt) / 1000);
  if (seconds < 0.001) return "(0.000s)";
  if (seconds < 10) return `(${seconds.toFixed(3)}s)`;
  return `(${seconds.toFixed(2)}s)`;
}

export function formatBlockMeta(block: TerminalBlock): string {
  const parts: string[] = [];
  if (block.cwd) parts.push(block.cwd);
  parts.push(formatBlockDuration(block));
  if (block.status === "failure" && block.exitCode !== null) {
    parts.push(`exit ${block.exitCode}`);
  }
  return parts.join("  ");
}

export function expandBlockEndLine(
  buffer: { getLine: (line: number) => { translateToString: (trimRight: boolean) => string } | undefined },
  commandLine: number,
  cursorLine: number,
): number {
  let end = commandLine;
  for (let line = commandLine; line < cursorLine; line++) {
    const text = buffer.getLine(line)?.translateToString(true) ?? "";
    if (text.trim()) end = line;
  }
  return end;
}

export function looksLikeTerminalClear(data: string): boolean {
  return /\x1b\[[0-9;]*3J|\x1b\[[0-9;]*2J/.test(data);
}

export function blockLineSpan(block: TerminalBlock): { start: number; end: number } | null {
  const start = block.commandMarkerLine;
  const end = block.endMarkerLine ?? block.commandMarkerLine;
  if (start === null || end === null) return null;
  // ponytail: OSC A fires at the *next* prompt and must not shrink the span start.
  return { start: Math.min(start, end), end: Math.max(start, end) };
}
