import type { ITheme } from "@xterm/xterm";
import {
  BUILTIN_TERMINAL_THEMES,
  listAllTerminalThemes,
  resolveTerminalTheme,
  resolveTerminalXtermTheme,
} from "./terminalThemes";

/** @deprecated use terminalThemes */
export type SshTerminalThemePreset = {
  id: string;
  label: string;
  theme: ITheme;
};

/** @deprecated use BUILTIN_TERMINAL_THEMES */
export const SSH_TERMINAL_THEMES: SshTerminalThemePreset[] = BUILTIN_TERMINAL_THEMES.map((item) => ({
  id: item.id,
  label: item.label,
  theme: item.xterm,
}));

export function resolveSshTerminalTheme(themeId: string | null | undefined): ITheme {
  return resolveTerminalXtermTheme(themeId);
}

export { listAllTerminalThemes, resolveTerminalTheme, BUILTIN_TERMINAL_THEMES };
