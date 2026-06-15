const EXECUTABLE_PATH_SUFFIX = /(\/|\\|^)(bash|zsh|sh|fish|nu|nushell|elvish|pwsh|powershell|cmd|dash)(\.exe)?$/i;

export function isShellExecutablePath(path: string): boolean {
  return EXECUTABLE_PATH_SUFFIX.test(path.trim().replace(/[\/\\]+$/, ""));
}

/** Replace `C:\Users\<name>`, `/Users/<name>`, or `/home/<name>` with `~` for display. */
export function formatPath(cwd: string | undefined): string {
  if (!cwd || cwd === "~") return "~";
  // Windows: C:\Users\<name>
  let formatted = cwd.replace(/^([A-Za-z]:\\Users\\[^\\]+)/i, "~");
  // macOS: /Users/<name>
  formatted = formatted.replace(/^(\/Users\/[^\/]+)/i, "~");
  // Linux: /home/<name>
  formatted = formatted.replace(/^(\/home\/[^\/]+)/i, "~");
  return formatted;
}

/** True when cwd is a real working directory, not home shorthand or a shell binary path. */
export function isDisplayableWorkingDirectory(cwd: string | undefined): cwd is string {
  if (!cwd || cwd === "~") return false;
  return !isShellExecutablePath(cwd);
}

/** Compact header path: home prefix, then last segment when still long. */
export function formatPathShort(cwd: string | undefined): string | null {
  if (!isDisplayableWorkingDirectory(cwd)) return null;
  const formatted = formatPath(cwd);
  if (formatted === "~") return null;
  const parts = formatted.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 2) return formatted;
  return parts[parts.length - 1] ?? formatted;
}

/** Home-shortened path for header tooltips (not the raw filesystem path). */
export function formatPathFull(cwd: string | undefined): string | null {
  if (!isDisplayableWorkingDirectory(cwd)) return null;
  const formatted = formatPath(cwd);
  return formatted === "~" ? null : formatted;
}

/** Format terminal title to show only the executable or directory basename when it is a full path. */
export function formatTitleCompact(title: string | undefined): string {
  if (!title) return "";
  const trimmed = title.trim();
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    const parts = trimmed.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts[parts.length - 1] ?? trimmed;
  }
  return trimmed;
}
