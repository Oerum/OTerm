export interface ShellProfile {
  id: string;
  label: string;
  program: string;
  args: string[];
}

export interface TerminalOutputEvent {
  sessionId: string;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
}

export type TerminalEntryColor =
  | "none"
  | "green"
  | "blue"
  | "yellow"
  | "purple"
  | "pink";

export interface WorkspacePane {
  id: string;
  sessionId: string | null;
  shellId: string;
  cwd: string;
  customTitle: string | null;
}

export interface WorkspaceTab {
  id: string;
  title: string;
  color: TerminalEntryColor;
  panes: WorkspacePane[];
  split: "none" | "horizontal";
}

export type TerminalMenuActionId =
  | "share-session"
  | "copy-branch"
  | "copy-pane-title"
  | "copy-working-directory"
  | "rename-tab"
  | "move-up"
  | "move-down"
  | "close-tab"
  | "close-other-tabs"
  | "close-tabs-below"
  | "save-as-profile";

export interface TerminalSidebarEntry {
  entryId: string;
  tabId: string;
  paneId: string;
  title: string;
  subtitle: string;
  splitIndex: number | null;
  shellId: string;
  shellLabel: string;
  cwd: string;
  sessionId: string | null;
  tabTitle: string;
  renameDefault: string;
  tabColor: TerminalEntryColor;
  gitBranch: string | null;
  gitIsRepo: boolean;
  isActive: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  entriesBelowCount: number;
  canCloseOthers: boolean;
}

export interface SaveProfileDraft {
  label: string;
  shellId: string;
  cwd: string;
  color: TerminalEntryColor;
}
