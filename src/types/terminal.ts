import type { CliAgentId } from "../lib/terminalAgentMode";

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
  exitCode: number | null;
}

export interface TerminalAgentChangedEvent {
  sessionId: string;
  agentId: string | null;
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
  activeAgentId: CliAgentId | null;
  oscTitle: string | null;
  hasUnseenNotification: boolean;
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

export interface WorkspaceIssuesTab {
  kind: "issues";
  id: string;
  title: string;
  repoRoot: string;
}

export interface WorkspaceDockerManagerTab {
  kind: "docker";
  id: string;
  title: string;
}

export interface WorkspaceSshSftpTab {
  kind: "sshSftp";
  id: string;
  title: string;
}

export interface WorkspaceSettingsTab {
  kind: "settings";
  id: string;
  title: string;
}

export type WorkspaceTab =
  | WorkspaceTerminalTab
  | WorkspacePullRequestsTab
  | WorkspaceBranchManagerTab
  | WorkspaceIssuesTab
  | WorkspaceDockerManagerTab
  | WorkspaceSshSftpTab
  | WorkspaceSettingsTab;

export function isTerminalTab(tab: WorkspaceTab): tab is WorkspaceTerminalTab {
  return tab.kind === "terminal";
}

export interface FeatureSidebarEntry {
  entryId: string;
  tabId: string;
  kind: "pullRequests" | "branchManager" | "issues" | "docker" | "sshSftp" | "settings";
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
  activeAgentId: CliAgentId | null;
  tabTitle: string;
  renameDefault: string;
  tabColor: TerminalEntryColor;
  gitBranch: string | null;
  gitIsRepo: boolean;
  gitChangedFiles: number;
  gitAdditions: number;
  gitDeletions: number;
  isActive: boolean;
  hasUnseenNotification: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  entriesBelowCount: number;
  canCloseOthers: boolean;
  terminalTabIndex: number;
  isFirstPaneOfTab: boolean;
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
  | { kind: "new-worktree-config" }
  | { kind: "new-tab-config" }
  | { kind: "reopen-closed" };

export interface ClosedTerminalSession {
  shellId: string;
  cwd: string;
  title: string;
  color: TerminalEntryColor;
}

export interface PersistedWorkspacePane {
  shellId: string;
  cwd: string;
  customTitle: string | null;
}

export interface PersistedTerminalTab {
  title: string;
  color: TerminalEntryColor;
  split: "none" | "horizontal";
  panes: PersistedWorkspacePane[];
}

export interface PersistedTerminalWorkspaceV1 {
  version: 1;
  tabs: PersistedTerminalTab[];
  activeTabIndex: number;
  activePaneIndex: number;
}
