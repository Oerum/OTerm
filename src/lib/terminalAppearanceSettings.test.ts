import { describe, expect, it } from "vitest";
import {
  parseTerminalAppearanceState,
  validateTerminalThemeExport,
} from "./terminalAppearanceSettings";
import { BUILTIN_TERMINAL_THEMES } from "./terminalThemes";

describe("parseTerminalAppearanceState", () => {
  it("falls back to defaults for invalid payloads", () => {
    expect(parseTerminalAppearanceState("{}")).toEqual({
      activeThemeId: BUILTIN_TERMINAL_THEMES[0]!.id,
      customThemes: [],
    });
  });

  it("keeps custom themes and ignores builtin duplicates", () => {
    const custom = {
      ...BUILTIN_TERMINAL_THEMES[0],
      id: "custom-dark",
      label: "Custom dark",
    };
    const parsed = parseTerminalAppearanceState(
      JSON.stringify({ activeThemeId: "custom-dark", customThemes: [custom, BUILTIN_TERMINAL_THEMES[0]] }),
    );
    expect(parsed.activeThemeId).toBe("custom-dark");
    expect(parsed.customThemes).toHaveLength(1);
    expect(parsed.customThemes[0]?.id).toBe("custom-dark");
  });
});

describe("validateTerminalThemeExport", () => {
  it("accepts valid exported themes", () => {
    const custom = {
      ...BUILTIN_TERMINAL_THEMES[0],
      id: "export-me",
      label: "Export me",
    };
    expect(validateTerminalThemeExport(custom)?.id).toBe("export-me");
  });

  it("rejects incomplete themes", () => {
    expect(validateTerminalThemeExport({ id: "x" })).toBeNull();
  });
});

describe("applyTerminalThemeCssVars", () => {
  it("sets --term-selection-bg and --term-selection-inactive-bg on root element", async () => {
    const { applyTerminalThemeCssVars } = await import("./terminalAppearanceSettings");
    const theme = BUILTIN_TERMINAL_THEMES[0]!;
    const vars = new Map<string, string>();
    const originalDocument = (globalThis as unknown as { document?: unknown }).document;
    (globalThis as unknown as { document: unknown }).document = {
      documentElement: {
        style: {
          setProperty: (k: string, v: string) => vars.set(k, v),
          removeProperty: () => {},
        },
      },
    };
    try {
      applyTerminalThemeCssVars(theme);
      expect(vars.get("--term-selection-bg")).toBe("rgba(38, 79, 120, 0.85)");
      expect(vars.get("--term-selection-fg")).toBe("#ffffff");
      expect(vars.get("--term-selection-inactive-bg")).toBe("rgba(38, 79, 120, 0.45)");
    } finally {
      (globalThis as unknown as { document: unknown }).document = originalDocument;
    }
  });
});
