import { describe, expect, it } from "vitest";
import { BUILTIN_TERMINAL_THEMES, resolveLiveInputTokenColor } from "./terminalThemes";

describe("resolveLiveInputTokenColor", () => {
  it("uses xterm brightGreen for live commands so cmd matches pwsh palette", () => {
    const theme = BUILTIN_TERMINAL_THEMES[0]!;
    expect(resolveLiveInputTokenColor("command", theme)).toBe("#00e5ba");
    expect(resolveLiveInputTokenColor("command", theme)).not.toBe(theme.tokens.command);
  });
});

describe("BUILTIN_TERMINAL_THEMES selection background", () => {
  it("defines high contrast active and inactive selection backgrounds and foreground for oterm default", () => {
    const defaultTheme = BUILTIN_TERMINAL_THEMES.find((t) => t.id === "oterm-default")!;
    expect(defaultTheme.xterm.selectionBackground).toBe("rgba(38, 79, 120, 0.85)");
    expect(defaultTheme.xterm.selectionForeground).toBe("#ffffff");
    expect(defaultTheme.xterm.selectionInactiveBackground).toBe("rgba(38, 79, 120, 0.45)");
  });
});
