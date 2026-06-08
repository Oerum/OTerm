const AGENT_EXECUTABLES = new Set([
  "claude",
  "codex",
  "gemini",
  "agy",
  "opencode",
  "agent",
]);

const AGENT_PACKAGE_HINTS = /claude|codex|opencode|gemini|agy/i;

export function isAgentLaunchCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  const first = trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (AGENT_EXECUTABLES.has(first)) return true;
  if (/^(npx|pnpm|pnpm\s+dlx|bunx|bun)\s+/.test(trimmed) && AGENT_PACKAGE_HINTS.test(trimmed)) {
    return true;
  }
  return false;
}

export function isAgentExitCommand(command: string): boolean {
  const t = command.trim().toLowerCase();
  return t === "exit" || t === "quit" || t === "logout";
}
