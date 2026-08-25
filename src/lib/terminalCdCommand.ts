import { shellQuote } from "./shellQuote";

export function buildTerminalCdCommand(path: string, shellId?: string): string {
  const sanitizedPath = path.replace(/[\r\n]/g, "");
  if (!sanitizedPath) return "";

  if (shellId === "cmd") {
    return `cd /d "${sanitizedPath.replace(/"/g, "")}"`;
  }
  if (shellId === "pwsh" || shellId === "powershell") {
    return `Set-Location -LiteralPath '${sanitizedPath.replace(/'/g, "''")}'`;
  }
  return `cd ${shellQuote(sanitizedPath)}`;
}
