import { describe, expect, it } from "vitest";
import { BUILTIN_TERMINAL_THEMES, resolveLiveInputTokenColor } from "./terminalThemes";

describe("resolveLiveInputTokenColor", () => {
  it("uses xterm brightGreen for live commands so cmd matches pwsh palette", () => {
    const theme = BUILTIN_TERMINAL_THEMES[0]!;
    expect(resolveLiveInputTokenColor("command", theme)).toBe("#00e5ba");
    expect(resolveLiveInputTokenColor("command", theme)).not.toBe(theme.tokens.command);
  });
});
