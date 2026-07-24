import type { ITheme } from "@xterm/xterm";

export type TerminalTokenColors = {
  command: string;
  subcommand: string;
  option: string;
  argument: string;
  variable: string;
};

export type TerminalBlockColors = {
  separator: string;
  meta: string;
  command: string;
  successBackground: string;
  failureBackground: string;
  failureRail: string;
  failureText: string;
  successRail: string;
};

export type TerminalTheme = {
  id: string;
  label: string;
  version: 1;
  xterm: ITheme;
  blocks: TerminalBlockColors;
  tokens: TerminalTokenColors;
};

export type TerminalAppearanceState = {
  activeThemeId: string;
  customThemes: TerminalTheme[];
};

