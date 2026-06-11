import type { ITheme } from "@xterm/xterm";

export type SshTerminalThemePreset = {
  id: string;
  label: string;
  theme: ITheme;
};

export const SSH_TERMINAL_THEMES: SshTerminalThemePreset[] = [
  {
    id: "oterm-default",
    label: "OTerm default",
    theme: {
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
    },
  },
  {
    id: "solarized-dark",
    label: "Solarized dark",
    theme: {
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
    },
  },
  {
    id: "dracula",
    label: "Dracula",
    theme: {
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
    },
  },
];

export function resolveSshTerminalTheme(themeId: string | null | undefined): ITheme {
  const preset = SSH_TERMINAL_THEMES.find((item) => item.id === themeId);
  return preset?.theme ?? SSH_TERMINAL_THEMES[0]!.theme;
}
