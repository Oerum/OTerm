import { getSetting, setSetting } from "./settingsStore";
import type {
  PersistedTerminalTab,
  PersistedTerminalTabGroup,
  PersistedTerminalWorkspaceV1,
  PersistedTerminalWorkspaceV2,
  PersistedWorkspacePane,
  TerminalEntryColor,
} from "../types/terminal";

export const WORKSPACE_TERMINAL_TABS_KEY = "oterm:workspace-terminal-tabs";

export const EMPTY_TERMINAL_WORKSPACE: PersistedTerminalWorkspaceV2 = {
  version: 2,
  groups: [],
  collapsedGroupIds: [],
  tabs: [],
  activeTabIndex: 0,
  activePaneIndex: 0,
};


function isTerminalColor(value: unknown): value is TerminalEntryColor {
  return typeof value === "string";
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
  const sshEndpointId =
    pane.sshEndpointId === null || typeof pane.sshEndpointId === "string"
      ? pane.sshEndpointId
      : null;
  return { shellId: pane.shellId, cwd: pane.cwd, customTitle, sshEndpointId };
}

function parseGroup(value: unknown): PersistedTerminalTabGroup | null {
  if (!value || typeof value !== "object") return null;
  const group = value as Record<string, unknown>;
  if (typeof group.id !== "string" || !group.id) return null;
  const name =
    typeof group.name === "string" && group.name.trim() ? group.name.trim() : "Group";
  const order =
    typeof group.order === "number" && Number.isFinite(group.order) ? group.order : 0;
  const color =
    typeof group.color === "string" && isTerminalColor(group.color)
      ? group.color
      : "none";
  return { id: group.id, name, order, color };
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
  const groupId =
    tab.groupId === null || typeof tab.groupId === "string" ? tab.groupId : null;

  return {
    title,
    color: tab.color,
    split,
    groupId,
    panes: split === "horizontal" ? panes : [panes[0]],
  };
}

function parseTabs(rawTabs: unknown): PersistedTerminalTab[] {
  if (!Array.isArray(rawTabs) || rawTabs.length === 0) return [];
  return rawTabs
    .map(parseTab)
    .filter((tab): tab is PersistedTerminalTab => tab !== null);
}

function parseActiveIndices(
  data: Record<string, unknown>,
  tabs: PersistedTerminalTab[],
): Pick<PersistedTerminalWorkspaceV2, "activeTabIndex" | "activePaneIndex"> {
  const activeTabIndex =
    typeof data.activeTabIndex === "number" && Number.isInteger(data.activeTabIndex)
      ? Math.max(0, Math.min(data.activeTabIndex, tabs.length - 1))
      : 0;

  const maxPaneIndex = tabs[activeTabIndex]?.panes.length ?? 1;
  const activePaneIndex =
    typeof data.activePaneIndex === "number" && Number.isInteger(data.activePaneIndex)
      ? Math.max(0, Math.min(data.activePaneIndex, maxPaneIndex - 1))
      : 0;

  return { activeTabIndex, activePaneIndex };
}

function buildWorkspaceV2(
  groups: PersistedTerminalTabGroup[],
  tabs: PersistedTerminalTab[],
  collapsedGroupIds: string[],
  activeTabIndex: number,
  activePaneIndex: number,
): PersistedTerminalWorkspaceV2 {
  const validIds = new Set(groups.map((group) => group.id));
  return {
    version: 2,
    groups,
    collapsedGroupIds: collapsedGroupIds.filter((id) => validIds.has(id)),
    tabs: tabs.map((tab) => ({
      ...tab,
      groupId: tab.groupId && validIds.has(tab.groupId) ? tab.groupId : null,
    })),
    activeTabIndex,
    activePaneIndex,
  };
}

export function upgradePersistedTerminalWorkspaceV1(
  snapshot: PersistedTerminalWorkspaceV1,
): PersistedTerminalWorkspaceV2 {
  return buildWorkspaceV2([], snapshot.tabs, [], snapshot.activeTabIndex, snapshot.activePaneIndex);
}

export function parsePersistedTerminalWorkspaceV2(
  raw: unknown,
): PersistedTerminalWorkspaceV2 | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (data.version !== 2) return null;

  const tabs = parseTabs(data.tabs);
  if (tabs.length === 0) return null;

  const groups = Array.isArray(data.groups)
    ? data.groups
        .map(parseGroup)
        .filter((group): group is PersistedTerminalTabGroup => group !== null)
    : [];

  const collapsedGroupIds = Array.isArray(data.collapsedGroupIds)
    ? data.collapsedGroupIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  const { activeTabIndex, activePaneIndex } = parseActiveIndices(data, tabs);
  return buildWorkspaceV2(groups, tabs, collapsedGroupIds, activeTabIndex, activePaneIndex);
}

export function parsePersistedTerminalWorkspaceV1(
  raw: unknown,
): PersistedTerminalWorkspaceV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (data.version !== 1) return null;

  const tabs = parseTabs(data.tabs);
  if (tabs.length === 0) return null;

  const { activeTabIndex, activePaneIndex } = parseActiveIndices(data, tabs);
  return { version: 1, tabs, activeTabIndex, activePaneIndex };
}

export function parsePersistedTerminalWorkspace(
  raw: unknown,
): PersistedTerminalWorkspaceV2 | null {
  const v2 = parsePersistedTerminalWorkspaceV2(raw);
  if (v2) return v2;

  const v1 = parsePersistedTerminalWorkspaceV1(raw);
  if (v1) return upgradePersistedTerminalWorkspaceV1(v1);

  return null;
}

export function loadPersistedTerminalWorkspace(): PersistedTerminalWorkspaceV2 | null {
  const raw = getSetting(WORKSPACE_TERMINAL_TABS_KEY);
  if (!raw) return null;
  try {
    return parsePersistedTerminalWorkspace(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function savePersistedTerminalWorkspace(
  snapshot: PersistedTerminalWorkspaceV2,
): Promise<void> {
  await setSetting(WORKSPACE_TERMINAL_TABS_KEY, JSON.stringify(snapshot));
}
