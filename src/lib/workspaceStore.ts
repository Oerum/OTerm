import { getSetting, setSetting } from "./settingsStore";
import type {
  PersistedTerminalTab,
  PersistedTerminalWorkspaceV1,
  PersistedWorkspacePane,
  TerminalEntryColor,
} from "../types/terminal";

export const WORKSPACE_TERMINAL_TABS_KEY = "oterm:workspace-terminal-tabs";

export const EMPTY_TERMINAL_WORKSPACE: PersistedTerminalWorkspaceV1 = {
  version: 1,
  tabs: [],
  activeTabIndex: 0,
  activePaneIndex: 0,
};

const TERMINAL_COLORS: TerminalEntryColor[] = [
  "none",
  "green",
  "blue",
  "yellow",
  "purple",
  "pink",
];

function isTerminalColor(value: unknown): value is TerminalEntryColor {
  return typeof value === "string" && TERMINAL_COLORS.includes(value as TerminalEntryColor);
}

function parsePane(value: unknown): PersistedWorkspacePane | null {
  if (!value || typeof value !== "object") return null;
  const pane = value as Record<string, unknown>;
  if (typeof pane.shellId !== "string" || !pane.shellId) return null;
  if (typeof pane.cwd !== "string" || !pane.cwd) return null;
  const customTitle =
    pane.customTitle === null
      ? null
      : typeof pane.customTitle === "string"
        ? pane.customTitle
        : null;
  return { shellId: pane.shellId, cwd: pane.cwd, customTitle };
}

function parseTab(value: unknown): PersistedTerminalTab | null {
  if (!value || typeof value !== "object") return null;
  const tab = value as Record<string, unknown>;
  if (tab.split !== "none" && tab.split !== "horizontal") return null;
  if (!isTerminalColor(tab.color)) return null;
  if (!Array.isArray(tab.panes) || tab.panes.length === 0) return null;

  const panes = tab.panes
    .map(parsePane)
    .filter((pane): pane is PersistedWorkspacePane => pane !== null);
  if (panes.length === 0) return null;

  const title = typeof tab.title === "string" && tab.title.trim() ? tab.title.trim() : "Terminal";
  const split = tab.split === "horizontal" && panes.length > 1 ? "horizontal" : "none";

  return { title, color: tab.color, split, panes: split === "horizontal" ? panes : [panes[0]] };
}

export function parsePersistedTerminalWorkspace(
  raw: unknown,
): PersistedTerminalWorkspaceV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (data.version !== 1) return null;
  if (!Array.isArray(data.tabs) || data.tabs.length === 0) return null;

  const tabs = data.tabs
    .map(parseTab)
    .filter((tab): tab is PersistedTerminalTab => tab !== null);
  if (tabs.length === 0) return null;

  const activeTabIndex =
    typeof data.activeTabIndex === "number" && Number.isInteger(data.activeTabIndex)
      ? Math.max(0, Math.min(data.activeTabIndex, tabs.length - 1))
      : 0;

  const maxPaneIndex = tabs[activeTabIndex]?.panes.length ?? 1;
  const activePaneIndex =
    typeof data.activePaneIndex === "number" && Number.isInteger(data.activePaneIndex)
      ? Math.max(0, Math.min(data.activePaneIndex, maxPaneIndex - 1))
      : 0;

  return { version: 1, tabs, activeTabIndex, activePaneIndex };
}

export function loadPersistedTerminalWorkspace(): PersistedTerminalWorkspaceV1 | null {
  const raw = getSetting(WORKSPACE_TERMINAL_TABS_KEY);
  if (!raw) return null;
  try {
    return parsePersistedTerminalWorkspace(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function savePersistedTerminalWorkspace(
  snapshot: PersistedTerminalWorkspaceV1,
): Promise<void> {
  await setSetting(WORKSPACE_TERMINAL_TABS_KEY, JSON.stringify(snapshot));
}
