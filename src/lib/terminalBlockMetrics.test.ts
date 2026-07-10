import { describe, expect, it } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { lineTopPx, readTerminalCellMetrics } from "./terminalBlockMetrics";

function makeTerminal(width = 9, height = 17): Terminal {
  return {
    element: null,
    _core: { _renderService: { dimensions: { css: { cell: { width, height } } } } },
  } as unknown as Terminal;
}

describe("readTerminalCellMetrics", () => {
  it("prefers render-service dimensions", () => {
    expect(readTerminalCellMetrics(makeTerminal(10, 22))).toEqual({ width: 10, height: 22 });
  });
});

describe("lineTopPx", () => {
  it("maps buffer lines to viewport pixels", () => {
    expect(lineTopPx(10, 8, 20)).toBe(40);
    expect(lineTopPx(3, 8, 20)).toBe(-100);
  });
});
