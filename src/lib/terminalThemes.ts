import type { ITheme } from "@xterm/xterm";
import type { TerminalBlockColors, TerminalTheme, TerminalTokenColors } from "../types/terminalTheme";

const DEFAULT_BLOCKS: TerminalBlockColors = {
  separator: "rgba(255, 255, 255, 0.06)",
  meta: "#6b7280",
  command: "#f5e6c8",
  successBackground: "rgba(255, 255, 255, 0.03)",
  failureBackground: "rgba(127, 29, 29, 0.42)",
  failureRail: "#f87171",
  failureText: "#fca5a5",
  successRail: "rgba(255, 255, 255, 0.08)",
};

const DEFAULT_TOKENS: TerminalTokenColors = {
  command: "#c9e265",
  subcommand: "#79a8ff",
  option: "#56d4dd",
  argument: "#f5e6c8",
  variable: "#c792ea",
};

function theme(
  id: string,
  label: string,
  xterm: ITheme,
  overrides?: Partial<{ blocks: Partial<TerminalBlockColors>; tokens: Partial<TerminalTokenColors> }>,
): TerminalTheme {
  return {
    id,
    label,
    version: 1,
    xterm,
    blocks: { ...DEFAULT_BLOCKS, ...overrides?.blocks },
    tokens: { ...DEFAULT_TOKENS, ...overrides?.tokens },
  };
}

export const BUILTIN_TERMINAL_THEMES: TerminalTheme[] = [
  theme("oterm-default", "OTerm default", {
    background: "transparent",
    foreground: "#ececec",
    cursor: "#00e5ba",
    cursorAccent: "transparent",
    selectionBackground: "rgba(0, 229, 186, 0.22)",
    black: "#0a0a0a",
    red: "#ff5f57",
    green: "#00e5ba",
    yellow: "#febc2e",
    blue: "#79a8ff",
    magenta: "#c792ea",
    cyan: "#56d4dd",
    white: "#ececec",
    brightBlack: "#5c5c5c",
    brightRed: "#ff7b72",
    brightGreen: "#00e5ba",
    brightYellow: "#ffd866",
    brightBlue: "#82aaff",
    brightMagenta: "#d4a5ff",
    brightCyan: "#56d4dd",
    brightWhite: "#ffffff",
  }),
  theme("solarized-dark", "Solarized dark", {
    background: "#002b36",
    foreground: "#839496",
    cursor: "#93a1a1",
    cursorAccent: "#002b36",
    selectionBackground: "rgba(147, 161, 161, 0.35)",
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
    brightBlack: "#586e75",
    brightRed: "#cb4b16",
    brightGreen: "#859900",
    brightYellow: "#b58900",
    brightBlue: "#268bd2",
    brightMagenta: "#6c71c4",
    brightCyan: "#2aa198",
    brightWhite: "#fdf6e3",
  }),
  theme("dracula", "Dracula", {
    background: "#282a36",
    foreground: "#f8f8f2",
    cursor: "#f8f8f2",
    cursorAccent: "#282a36",
    selectionBackground: "rgba(68, 71, 90, 0.8)",
    black: "#21222c",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#bd93f9",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
    brightBlack: "#6272a4",
    brightRed: "#ff6e6e",
    brightGreen: "#69ff94",
    brightYellow: "#ffffa5",
    brightBlue: "#d6acff",
    brightMagenta: "#ff92df",
    brightCyan: "#a4ffff",
    brightWhite: "#ffffff",
  }),
];

export function resolveTerminalTheme(
  themeId: string | null | undefined,
  customThemes: TerminalTheme[] = [],
): TerminalTheme {
  const defaults = BUILTIN_TERMINAL_THEMES[0]!;
  const id = themeId?.trim();
  let theme = defaults;
  if (id) {
    const custom = customThemes.find((item) => item.id === id);
    if (custom) theme = custom;
    else {
      const preset = BUILTIN_TERMINAL_THEMES.find((item) => item.id === id);
      if (preset) theme = preset;
    }
  }
  return {
    ...theme,
    blocks: { ...defaults.blocks, ...theme.blocks },
    tokens: { ...defaults.tokens, ...theme.tokens },
  };
}

export function resolveTerminalXtermTheme(
  themeId: string | null | undefined,
  customThemes: TerminalTheme[] = [],
): ITheme {
  return resolveTerminalTheme(themeId, customThemes).xterm;
}

export function listAllTerminalThemes(customThemes: TerminalTheme[] = []): TerminalTheme[] {
  const builtinIds = new Set(BUILTIN_TERMINAL_THEMES.map((item) => item.id));
  return [...BUILTIN_TERMINAL_THEMES, ...customThemes.filter((item) => !builtinIds.has(item.id))];
}

/** Live cmd/bash input — mirror PSReadLine palette mapping (xterm greens), not block token colors. */
export function resolveLiveInputTokenColor(kind: string, theme: TerminalTheme): string {
  const x = theme.xterm;
  switch (kind) {
    case "command":
      return x.brightGreen ?? x.green ?? theme.tokens.command;
    case "subcommand":
      return x.brightBlue ?? x.blue ?? theme.tokens.subcommand;
    case "option":
      return x.cyan ?? x.brightCyan ?? theme.tokens.option;
    case "variable":
      return x.magenta ?? x.brightMagenta ?? theme.tokens.variable;
    default:
      return x.foreground ?? theme.tokens.argument;
  }
}

export function cloneTerminalTheme(source: TerminalTheme, id: string, label: string): TerminalTheme {
  return {
    ...source,
    id,
    label,
    version: 1,
    xterm: { ...source.xterm },
    blocks: { ...source.blocks },
    tokens: { ...source.tokens },
  };
}
