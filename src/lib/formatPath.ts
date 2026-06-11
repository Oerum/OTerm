const EXECUTABLE_PATH_SUFFIX = /\.(exe|cmd|bat|com|msi)$/i;

export function isShellExecutablePath(path: string): boolean {
  return EXECUTABLE_PATH_SUFFIX.test(path.trim().replace(/[/\\]+$/, ""));
}

/** Replace `C:\Users\<name>` with `~` for display. */
export function formatPath(cwd: string | undefined): string {
  if (!cwd || cwd === "~") return "~";
  return cwd.replace(/^([A-Za-z]:\\Users\\[^\\]+)/, "~");
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
