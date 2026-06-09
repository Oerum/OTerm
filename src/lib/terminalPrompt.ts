const PS_PROMPT =
  /PS\s+([A-Za-z]:\\[^\r\n>]+)>/;

/** Paths ending with `>` (pwsh/bash on some setups). */
const UNIX_PROMPT_GT =
  /((?:\/[\w.-]+)+)>/;

/** user@host:/path$ or user@host:/path# */
const UNIX_PROMPT_BASH =
  /:((?:\/[\w.-]+)+)[$#](?:\s|$)/;

export function stripAnsiForPrompt(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\r/g, "");
}

export function looksLikeTuiTransition(text: string): boolean {
  return /\x1b\[\?1049[hl]|\x1b\[2J|\x1b\[3J|\x1b\[H/.test(text);
}

export function detectShellPrompt(text: string): { cwd: string } | null {
  const psMatch = text.match(PS_PROMPT);
  if (psMatch?.[1]) {
    return { cwd: psMatch[1].trim() };
  }

  const unixGtMatch = text.match(UNIX_PROMPT_GT);
  if (unixGtMatch?.[1]) {
    return { cwd: unixGtMatch[1].trim() };
  }

  const bashMatch = text.match(UNIX_PROMPT_BASH);
  if (bashMatch?.[1]) {
    return { cwd: bashMatch[1].trim() };
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
