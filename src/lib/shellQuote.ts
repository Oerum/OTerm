export function shellQuote(value: string): string {
  if (/^[a-zA-Z0-9_.-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Safely quotes a value for use in a shell command string, adapting to the target shell.
 * Use this when interpolating identifiers or user input into `pendingTerminalCommands.set`.
 */
export function quoteForShell(value: string, shellId?: string): string {
  if (shellId === "cmd") {
    // CMD does not support single quotes, it only supports double quotes.
    return `"${value.replace(/"/g, "")}"`;
  }
  if (shellId === "pwsh" || shellId === "powershell") {
    // PowerShell supports single quotes, where '' escapes a single quote.
    return `'${value.replace(/'/g, "''")}'`;
  }
  // POSIX shells (bash, zsh, sh, etc)
  return shellQuote(value);
}
