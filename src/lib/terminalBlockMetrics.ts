import type { Terminal } from "@xterm/xterm";

export type TerminalCellMetrics = {
  width: number;
  height: number;
};

/** Match xterm render-service cell dimensions (includes lineHeight). */
export function readTerminalCellMetrics(terminal: Terminal | null): TerminalCellMetrics {
  const core = (terminal as unknown as {
    _core?: { _renderService?: { dimensions?: { css?: { cell?: { width?: number; height?: number } } } } };
  } | null)?._core;
  const cell = core?._renderService?.dimensions?.css?.cell;
  if (cell && cell.width && cell.height) {
    return { width: cell.width, height: cell.height };
  }

  const measure = terminal?.element?.querySelector(".xterm-char-measure-element") as HTMLElement | null;
  if (measure && measure.offsetWidth > 0 && measure.offsetHeight > 0) {
    return { width: measure.offsetWidth, height: measure.offsetHeight };
  }

  return { width: 9, height: 20 };
}

export function lineTopPx(line: number, viewportY: number, cellHeight: number): number {
  return (line - viewportY) * cellHeight;
}
