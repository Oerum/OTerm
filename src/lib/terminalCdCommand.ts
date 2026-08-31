import { quoteForShell } from "./shellQuote";

export function buildTerminalCdCommand(path: string, shellId?: string): string {
  const sanitizedPath = path.replace(/[\r\n]/g, "");
  if (!sanitizedPath) return "";

  if (shellId === "cmd") {
    return `cd /d ${quoteForShell(sanitizedPath, shellId)}`;
  }
  if (shellId === "pwsh" || shellId === "powershell") {
    return `Set-Location -LiteralPath ${quoteForShell(sanitizedPath, shellId)}`;
  }
  return `cd ${quoteForShell(sanitizedPath, shellId)}`;
}
