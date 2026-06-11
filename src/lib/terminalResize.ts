export const MIN_PTY_COLS = 2;
export const MIN_PTY_ROWS = 2;

export function shouldForwardPtyResize(input: {
  tabActive: boolean;
  cols: number;
  rows: number;
}): boolean {
  if (!input.tabActive) return false;
  if (input.cols < MIN_PTY_COLS || input.rows < MIN_PTY_ROWS) return false;
  return true;
}
