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

export interface WorkspaceTerminalTab {
  kind: "terminal";
  id: string;
  title: string;
  color: TerminalEntryColor;
  panes: WorkspacePane[];
  split: "none" | "horizontal";
}

export interface WorkspacePullRequestsTab {
  kind: "pullRequests";
  id: string;
  title: string;
  repoRoot: string;
}

export interface WorkspaceBranchManagerTab {
  kind: "branchManager";
  id: string;
  title: string;
  repoRoot: string;
}

export type WorkspaceTab =
  | WorkspaceTerminalTab
  | WorkspacePullRequestsTab
  | WorkspaceBranchManagerTab;

export function isTerminalTab(tab: WorkspaceTab): tab is WorkspaceTerminalTab {
  return tab.kind === "terminal";
}

export interface FeatureSidebarEntry {
  entryId: string;
  tabId: string;
  kind: "pullRequests" | "branchManager";
  title: string;
  isActive: boolean;
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
  gitChangedFiles: number;
  gitAdditions: number;
  gitDeletions: number;
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

export type CreateMenuAction =
  | { kind: "default-terminal" }
  | { kind: "shell"; shellId: string }
  | { kind: "agent" }
  | { kind: "cloud-agent" }
  | { kind: "new-worktree-config" }
  | { kind: "new-tab-config" }
  | { kind: "reopen-closed" };

export interface ClosedTerminalSession {
  shellId: string;
  cwd: string;
  title: string;
  color: TerminalEntryColor;
}
