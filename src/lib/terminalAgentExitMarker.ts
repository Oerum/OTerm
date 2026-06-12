const MARKER_PREFIX = "\x1b]OTermAgentExit;code=";
const MARKER_SUFFIX = "\x1b\\";
export const AGENT_EXIT_MARKER_PATTERN = new RegExp(
  `${escapeRegExp(MARKER_PREFIX)}(\\d+)${escapeRegExp(MARKER_SUFFIX)}`,
  "g",
);

export interface ParsedAgentExitMarker {
  exitCode: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function supportsAgentExitMarker(shellId: string): boolean {
  return shellId !== "cmd";
}

export function buildAgentExitMarkerSuffix(shellId: string): string | null {
  if (!supportsAgentExitMarker(shellId)) return null;

  if (shellId === "pwsh" || shellId === "powershell") {
    return "; Write-Host -NoNewline ([char]27 + ']OTermAgentExit;code=' + $LASTEXITCODE + [char]27 + '\\')";
  }

  if (shellId === "fish") {
    return "; printf '\\033]OTermAgentExit;code=%s\\033\\\\' $status";
  }

  if (shellId === "nu") {
    return '; print $"\\e]OTermAgentExit;code=($env.LAST_EXIT_CODE)\\e\\\\"';
  }

  return "; printf '\\033]OTermAgentExit;code=%s\\033\\\\' $?";
}

export function formatAgentExitMarker(exitCode: number): string {
  return `${MARKER_PREFIX}${exitCode}${MARKER_SUFFIX}`;
}

export function parseAgentExitMarkers(data: string): ParsedAgentExitMarker[] {
  const markers: ParsedAgentExitMarker[] = [];
  for (const match of data.matchAll(AGENT_EXIT_MARKER_PATTERN)) {
    markers.push({ exitCode: Number.parseInt(match[1] ?? "0", 10) });
  }
  AGENT_EXIT_MARKER_PATTERN.lastIndex = 0;
  return markers;
}

export function stripAgentExitMarkers(data: string): string {
  return data.replace(AGENT_EXIT_MARKER_PATTERN, "");
}

export function splitAgentExitMarkerCarry(buffer: string): {
  processable: string;
  carry: string;
} {
  const holdStart = findAgentExitMarkerCarryStart(buffer);
  if (holdStart === -1) {
    return { processable: buffer, carry: "" };
  }
  return {
    processable: buffer.slice(0, holdStart),
    carry: buffer.slice(holdStart),
  };
}

function findAgentExitMarkerCarryStart(text: string): number {
  let idx = text.lastIndexOf("\x1b");
  while (idx !== -1) {
    const tail = text.slice(idx);
    if (tail.startsWith(MARKER_PREFIX) && !tail.includes(MARKER_SUFFIX)) {
      return idx;
    }
    if (
      MARKER_PREFIX.startsWith(tail) &&
      tail.length < MARKER_PREFIX.length
    ) {
      return idx;
    }
    if (idx === 0) break;
    idx = text.lastIndexOf("\x1b", idx - 1);
  }
  return -1;
}

export function processAgentExitMarkerChunk(
  carry: string,
  chunk: string,
): {
  carry: string;
  stripped: string;
  markers: ParsedAgentExitMarker[];
} {
  const combined = carry + chunk;
  const { processable, carry: nextCarry } = splitAgentExitMarkerCarry(combined);
  const markers = parseAgentExitMarkers(processable);
  return {
    carry: nextCarry,
    stripped: stripAgentExitMarkers(processable),
    markers,
  };
}
