import { computed, ref, watch } from "vue";
import type { TerminalAppearanceState, TerminalTheme } from "../types/terminalTheme";
import {
  BUILTIN_TERMINAL_THEMES,
  cloneTerminalTheme,
  listAllTerminalThemes,
  resolveTerminalTheme,
} from "./terminalThemes";
import { applyChromeTheme, chromeTokensFromTerminalColors } from "./applyChromeTheme";
import { getSetting, setSetting } from "./settingsStore";

const STORAGE_KEY = "oterm:terminal-appearance";
const CHROME_THEME_KEY = "oterm:theme-app-chrome";

const DEFAULT_STATE: TerminalAppearanceState = {
  activeThemeId: BUILTIN_TERMINAL_THEMES[0]!.id,
  customThemes: [],
};

const stateRef = ref<TerminalAppearanceState>({ ...DEFAULT_STATE });
let hydrated = false;

function isColor(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseTheme(raw: unknown): TerminalTheme | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<TerminalTheme>;
  if (!item.id || !item.label || item.version !== 1 || !item.xterm || !item.blocks || !item.tokens) {
    return null;
  }
  const builtin = BUILTIN_TERMINAL_THEMES.find((preset) => preset.id === item.id);
  if (builtin) return null;
  return {
    id: item.id,
    label: item.label,
    version: 1,
    xterm: { ...item.xterm },
    blocks: { ...item.blocks },
    tokens: { ...item.tokens },
  };
}

export function parseTerminalAppearanceState(raw: string): TerminalAppearanceState {
  const parsed = JSON.parse(raw) as Partial<TerminalAppearanceState>;
  const activeThemeId =
    typeof parsed.activeThemeId === "string" && parsed.activeThemeId.trim()
      ? parsed.activeThemeId.trim()
      : DEFAULT_STATE.activeThemeId;
  const customThemes = Array.isArray(parsed.customThemes)
    ? parsed.customThemes.map(parseTheme).filter((item): item is TerminalTheme => item !== null)
    : [];
  return { activeThemeId, customThemes };
}

export function validateTerminalThemeExport(raw: unknown): TerminalTheme | null {
  const theme = parseTheme(raw);
  if (!theme) return null;
  for (const key of ["command", "subcommand", "option", "argument", "variable"] as const) {
    if (!isColor(theme.tokens[key])) return null;
  }
  for (const key of [
    "separator",
    "meta",
    "command",
    "successBackground",
    "failureBackground",
    "failureRail",
    "failureText",
    "successRail",
  ] as const) {
    if (!isColor(theme.blocks[key])) return null;
  }
  const requiredXterm = ["foreground", "background", "cursor"] as const;
  for (const key of requiredXterm) {
    if (!isColor(theme.xterm[key])) return null;
  }
  return theme;
}

watch(
  stateRef,
  (value) => {
    if (!hydrated) return;
    applyTerminalThemeCssVars(resolveTerminalTheme(value.activeThemeId, value.customThemes));
    void setSetting(STORAGE_KEY, JSON.stringify(value));
  },
  { deep: true },
);

export async function initTerminalAppearanceSettings(): Promise<void> {
  try {
    const raw = getSetting(STORAGE_KEY);
    stateRef.value = raw ? parseTerminalAppearanceState(raw) : { ...DEFAULT_STATE };
  } catch {
    stateRef.value = { ...DEFAULT_STATE };
  } finally {
    hydrated = true;
  }
}

export function useTerminalAppearanceSettings() {
  const activeTheme = computed(() =>
    resolveTerminalTheme(stateRef.value.activeThemeId, stateRef.value.customThemes),
  );

  const allThemes = computed(() => listAllTerminalThemes(stateRef.value.customThemes));

  function setActiveThemeId(themeId: string) {
    stateRef.value = { ...stateRef.value, activeThemeId: themeId };
  }

  function upsertCustomTheme(theme: TerminalTheme) {
    const customThemes = stateRef.value.customThemes.filter((item) => item.id !== theme.id);
    customThemes.push(theme);
    stateRef.value = { ...stateRef.value, customThemes };
  }

  function removeCustomTheme(themeId: string) {
    stateRef.value = {
      ...stateRef.value,
      customThemes: stateRef.value.customThemes.filter((item) => item.id !== themeId),
      activeThemeId:
        stateRef.value.activeThemeId === themeId
          ? BUILTIN_TERMINAL_THEMES[0]!.id
          : stateRef.value.activeThemeId,
    };
  }

  function duplicateTheme(sourceId: string, newId: string, label: string) {
    const source = resolveTerminalTheme(sourceId, stateRef.value.customThemes);
    upsertCustomTheme(cloneTerminalTheme(source, newId, label));
    setActiveThemeId(newId);
  }

  function resetToDefaults() {
    stateRef.value = { ...DEFAULT_STATE };
  }

  async function saveState(next: TerminalAppearanceState): Promise<void> {
    stateRef.value = { ...next };
    if (!hydrated) hydrated = true;
    await setSetting(STORAGE_KEY, JSON.stringify(stateRef.value));
  }

  function exportTheme(themeId: string): TerminalTheme {
    return resolveTerminalTheme(themeId, stateRef.value.customThemes);
  }

  function importTheme(raw: unknown): TerminalTheme | null {
    const theme = validateTerminalThemeExport(raw);
    if (!theme) return null;
    upsertCustomTheme(theme);
    return theme;
  }

  return {
    state: stateRef,
    activeTheme,
    allThemes,
    setActiveThemeId,
    upsertCustomTheme,
    removeCustomTheme,
    duplicateTheme,
    resetToDefaults,
    saveState,
    exportTheme,
    importTheme,
  };
}

export function isThemeAppChromeEnabled(): boolean {
  return getSetting(CHROME_THEME_KEY) === "true";
}

export async function setThemeAppChromeEnabled(enabled: boolean): Promise<void> {
  await setSetting(CHROME_THEME_KEY, enabled ? "true" : "false");
  applyTerminalThemeCssVars(
    resolveTerminalTheme(stateRef.value.activeThemeId, stateRef.value.customThemes),
  );
}

export function applyTerminalThemeCssVars(theme: TerminalTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--term-block-separator", theme.blocks.separator);
  root.style.setProperty("--term-block-meta", theme.blocks.meta);
  root.style.setProperty("--term-block-command", theme.blocks.command);
  root.style.setProperty("--term-block-success-bg", theme.blocks.successBackground);
  root.style.setProperty("--term-block-failure-bg", theme.blocks.failureBackground);
  root.style.setProperty("--term-block-failure-rail", theme.blocks.failureRail);
  root.style.setProperty("--term-block-failure-text", theme.blocks.failureText);
  root.style.setProperty("--term-block-success-rail", theme.blocks.successRail);
  root.style.setProperty("--term-token-command", theme.tokens.command);
  root.style.setProperty("--term-token-subcommand", theme.tokens.subcommand);
  root.style.setProperty("--term-token-option", theme.tokens.option);
  root.style.setProperty("--term-token-argument", theme.tokens.argument);
  root.style.setProperty("--term-token-variable", theme.tokens.variable);
  root.style.setProperty("--term-cursor-color", theme.xterm.cursor ?? "#00e5ba");
  root.style.setProperty(
    "--term-block-active-rail",
    theme.xterm.brightGreen ?? theme.xterm.green ?? theme.xterm.cursor ?? "#00e5ba",
  );
  root.style.setProperty("--term-selection-bg", theme.xterm.selectionBackground ?? "rgba(38, 79, 120, 0.85)");
  root.style.setProperty("--term-selection-fg", theme.xterm.selectionForeground ?? "#ffffff");
  root.style.setProperty(
    "--term-selection-inactive-bg",
    theme.xterm.selectionInactiveBackground ?? "rgba(38, 79, 120, 0.45)",
  );

  // Opt-in: retint app chrome from terminal theme colors.
  if (isThemeAppChromeEnabled()) {
    const derived = chromeTokensFromTerminalColors({
      background: theme.xterm.background,
      foreground: theme.xterm.foreground,
      cursor: theme.xterm.cursor,
    });
    applyChromeTheme(derived);
  } else {
    applyChromeTheme(null);
  }
}

/** Used by settings color inputs — accepts hex and rgba strings. */
export function isThemeColorInput(value: string): boolean {
  const trimmed: string = value.trim();
  if (!trimmed) return false;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) return true;
  return trimmed.startsWith("rgba(") || trimmed.startsWith("rgb(");
}
