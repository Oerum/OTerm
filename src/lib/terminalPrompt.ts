const PS_PROMPT =
  /PS\s+([A-Za-z]:\\[^\r\n>]+)>$/;

const PS_PROMPT_PREFIX =
  /^PS\s+([A-Za-z]:\\[^\r\n>]+)>\s*/;

const CMD_PROMPT = /([A-Za-z]:\\[^>\r\n]*)>$/;

const CMD_PROMPT_PREFIX = /^([A-Za-z]:\\[^>\r\n]*)>\s*/;

/** Paths ending with `>` (pwsh/bash on some setups). Reject HTML closing tags like </div>. */
const UNIX_PROMPT_GT =
  /(?<!<)((?:\/[\w.-]+)+)>$/;

const WINDOWS_CWD = /^[A-Za-z]:\\/;

/** Reject markup fragments and other non-directory paths inferred from PTY output. */
export function isPlausiblePromptCwd(cwd: string): boolean {
  const trimmed = cwd.trim();
  if (!trimmed || trimmed === "~") return false;
  if (WINDOWS_CWD.test(trimmed)) return true;
  if (!trimmed.startsWith("/")) return false;
    // ⚡ Bolt Optimization: Use manual loop to count path segments
  // instead of allocating arrays with .split('/').filter(Boolean) on hot PTY path.
  let segments = 0;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] !== '/' && (i === 0 || trimmed[i - 1] === '/')) {
      segments++;
    }
  }
  return segments >= 2;
}

/** user@host:/path$ or user@host:/path# */
const UNIX_PROMPT_BASH =
  /:((?:\/[\w.-]+)+)[$#]$/;

const OSC_SEQUENCE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const CSI_SEQUENCE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

export function stripAnsiForPrompt(text: string): string {
  return text.replace(OSC_SEQUENCE, "").replace(CSI_SEQUENCE, "").replace(/\r/g, "");
}

/** Private-mode CSI leftovers after ESC was dropped (e.g. `[?2004h`, trailing `[?`). */
const ORPHAN_PRIVATE_MODE = /\[\?[0-9;]*[a-zA-Z]?/g;

/** Sanitize PTY noise for human-readable log panels (not for prompt/cwd parsing). */
export function sanitizeTerminalLogText(text: string): string {
  return stripAnsiForPrompt(text)
    .replace(/\x1b./g, "")
    .replace(ORPHAN_PRIVATE_MODE, "")
    .replace(/\x07/g, "");
}

/** Map a visible-text index back to a raw PTY string index (skips OSC/CSI bytes). */
export function rawIndexForStrippedIndex(raw: string, strippedIndex: number): number {
  if (strippedIndex <= 0) return 0;

  let visible = 0;
  let index = 0;
  while (index < raw.length && visible < strippedIndex) {
    const tail = raw.slice(index);
    const osc = tail.match(/^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/);
    if (osc) {
      index += osc[0].length;
      continue;
    }
    const csi = tail.match(/^\x1b\[[0-9;?]*[ -/]*[@-~]/);
    if (csi) {
      index += csi[0].length;
      continue;
    }
    visible += 1;
    index += 1;
  }
  return index;
}

export function looksLikeTuiTransition(text: string): boolean {
  return /\x1b\[\?1049[hl]|\x1b\[2J|\x1b\[3J|\x1b\[H/.test(text);
}

function promptCwd(raw: string): { cwd: string } | null {
  const cwd = raw.trim();
  return isPlausiblePromptCwd(cwd) ? { cwd } : null;
}

/** Extract cwd from a command row that still contains the typed command after the prompt. */
export function extractCwdFromPromptLine(text: string): string | null {
  const line = stripAnsiForPrompt(text);
  const psMatch = line.match(PS_PROMPT_PREFIX);
  if (psMatch?.[1]) return promptCwd(psMatch[1])?.cwd ?? null;

  const cmdMatch = line.match(CMD_PROMPT_PREFIX);
  if (cmdMatch?.[1]) return promptCwd(cmdMatch[1])?.cwd ?? null;

  const unixGtMatch = line.match(/^((?:\/[\w.-]+)+)>\s*/);
  if (unixGtMatch?.[1]) return promptCwd(unixGtMatch[1])?.cwd ?? null;

  const bashMatch = line.match(/^[\w.-]+@[\w.-]+:((?:\/[\w.-]+)+)[$#]\s*/);
  if (bashMatch?.[1]) return promptCwd(bashMatch[1])?.cwd ?? null;

  return null;
}

export function detectShellPrompt(text: string): { cwd: string } | null {
  const line = text.trim();
  const psMatch = line.match(PS_PROMPT);
  if (psMatch?.[1]) {
    return promptCwd(psMatch[1]);
  }

  const cmdMatch = line.match(CMD_PROMPT);
  if (cmdMatch?.[1]) {
    return promptCwd(cmdMatch[1]);
  }

  const unixGtMatch = line.match(UNIX_PROMPT_GT);
  if (unixGtMatch?.[1]) {
    return promptCwd(unixGtMatch[1]);
  }

  const bashMatch = line.match(UNIX_PROMPT_BASH);
  if (bashMatch?.[1]) {
    return promptCwd(bashMatch[1]);
  }

  return null;
}

/** Match a shell prompt only on the last non-empty line of PTY output. */
export function detectTrailingShellPrompt(text: string): { cwd: string } | null {
  const lines = stripAnsiForPrompt(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  return detectShellPrompt(lines[lines.length - 1]!);
}

const PROMPT_SCAN_MAX = 8192;

/** Accumulate PTY chunks so prompts split across writes still match. */
export function appendPromptScanBuffer(
  buffer: string,
  chunk: string,
): { buffer: string; trailingPrompt: { cwd: string } | null } {
  const next = (buffer + chunk).slice(-PROMPT_SCAN_MAX);
  return {
    buffer: next,
    trailingPrompt: detectTrailingShellPrompt(next),
  };
}
