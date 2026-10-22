const MIN_PTY_COLS = 2;
const MIN_PTY_ROWS = 2;
export const PTY_LAYOUT_WAIT_MAX_FRAMES = 20;
export const MOUNT_CONTAINER_WAIT_MAX_FRAMES = 8;

export function isValidPtySize(cols: number, rows: number): boolean {
  return cols >= MIN_PTY_COLS && rows >= MIN_PTY_ROWS;
}

/** Fatal launch errors block bootstrap; transient layout/mount waits allow retry. */
export function shouldBlockBootstrap(input: {
  launchError: string | null;
  awaitingReady: boolean;
}): boolean {
  return Boolean(input.launchError && !input.awaitingReady);
}

export function shouldForwardPtyResize(input: {
  tabActive: boolean;
  cols: number;
  rows: number;
  lastCols?: number | null;
  lastRows?: number | null;
}): boolean {
  if (!input.tabActive) return false;
  if (!isValidPtySize(input.cols, input.rows)) return false;
  if (input.lastCols === input.cols && input.lastRows === input.rows) return false;
  return true;
}

export function isWindowsConPtySession(input: {
  isSshSession: boolean;
  platform?: string;
  userAgent?: string;
}): boolean {
  if (input.isSshSession) return false;
  const platform =
    input.platform ?? (typeof navigator !== "undefined" ? navigator.platform : "");
  const userAgent =
    input.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  return /Win/i.test(platform) || /Windows/i.test(userAgent);
}
