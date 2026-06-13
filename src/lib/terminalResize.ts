export const MIN_PTY_COLS = 2;
export const MIN_PTY_ROWS = 2;
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
}): boolean {
  if (!input.tabActive) return false;
  if (!isValidPtySize(input.cols, input.rows)) return false;
  return true;
}
