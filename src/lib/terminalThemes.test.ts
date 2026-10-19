import { isProxy, nextTick, reactive, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { initTerminalAppearanceSettings, useTerminalAppearanceSettings } from "./terminalAppearanceSettings";
import { BUILTIN_TERMINAL_THEMES, cloneTerminalTheme, resolveLiveInputTokenColor } from "./terminalThemes";

const persist = vi.hoisted(() => vi.fn(async (_key: string, _value: string) => {}));
vi.mock("./settingsStore", () => ({ getSetting: () => null, setSetting: persist }));

describe("cloneTerminalTheme", () => {
  it("saves a reactive custom-theme draft with independent xterm, block and token values", async () => {
    await initTerminalAppearanceSettings();
    const settings = useTerminalAppearanceSettings();
    const preset = BUILTIN_TERMINAL_THEMES[0]!;
    const custom = reactive(cloneTerminalTheme(preset, "custom-source", "Source"));
    try {
      settings.upsertCustomTheme(custom);
      settings.setActiveThemeId(custom.id);
      expect(isProxy(settings.activeTheme.value.xterm)).toBe(true);
      const draft = ref(cloneTerminalTheme(settings.activeTheme.value, custom.id, custom.label));
      draft.value.xterm.background = "#ffffff";
      draft.value.blocks.command = "#111111";
      draft.value.tokens.command = "#222222";
      const saved = cloneTerminalTheme(draft.value, "custom-copy", "Saved copy");
      expect([saved, saved.xterm, saved.blocks, saved.tokens].some(isProxy)).toBe(false);
      settings.upsertCustomTheme(saved);
      settings.setActiveThemeId(saved.id);
      await nextTick();

      const [key, value] = persist.mock.calls[persist.mock.calls.length - 1]!;
      expect(key).toBe("oterm:terminal-appearance");
      const stored = JSON.parse(value);
      expect(stored.activeThemeId).toBe(saved.id);
      expect(stored.customThemes.find((theme: { id: string }) => theme.id === saved.id)).toEqual(saved);

      draft.value.xterm.background = "#eeeeee";
      draft.value.blocks.command = "#333333";
      draft.value.tokens.command = "#444444";
      expect(settings.activeTheme.value.xterm.background).toBe("#ffffff");
      expect(settings.activeTheme.value.blocks.command).toBe("#111111");
      expect(settings.activeTheme.value.tokens.command).toBe("#222222");
      expect(custom.xterm).toEqual(preset.xterm);
      expect(custom.blocks).toEqual(preset.blocks);
      expect(custom.tokens).toEqual(preset.tokens);

      const reloaded = cloneTerminalTheme(settings.activeTheme.value, saved.id, saved.label);
      reloaded.xterm.background = "#dddddd";
      reloaded.blocks.command = "#555555";
      reloaded.tokens.command = "#666666";
      expect(saved.xterm.background).toBe("#ffffff");
      expect(saved.blocks.command).toBe("#111111");
      expect(saved.tokens.command).toBe("#222222");
    } finally {
      settings.resetToDefaults();
      await nextTick();
    }
  });
});

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
