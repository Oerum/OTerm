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

export interface TerminalProcessChangedEvent {
  sessionId: string;
  processName: string | null;
  command: string | null;
}

export type TerminalEntryColor =
  | "none"
  | "green"
  | "blue"
  | "yellow"
  | "purple"
  | "pink"
  | (string & {});

export type AgentSemanticStatus = "idle" | "working" | "blocked" | "unknown";

export interface WorkspacePane {
  id: string;
  sessionId: string | null;
  bootstrappingSessionId: string | null;
  shellId: string;
  cwd: string;
  customTitle: string | null;
  activeAgentId: CliAgentId | null;
  activeProcessName?: string | null;
  activeProcessCmd?: string | null;
  oscTitle: string | null;
  hasUnseenNotification: boolean;
  agentStatus: AgentSemanticStatus;
  agentStatusSeen: boolean;
  /** When set, the pane uses the native russh SSH terminal instead of a local shell. */
  sshEndpointId: string | null;
}

export interface TerminalTabGroup {
  id: string;
  name: string;
  order: number;
  color: TerminalEntryColor;
  worktreeBasePath?: string | null;
}

export interface WorkspaceTerminalTab {
  kind: "terminal";
  id: string;
  title: string;
  color: TerminalEntryColor;
  groupId: string | null;
  panes: WorkspacePane[];
  split: "none" | "horizontal" | "vertical";
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

export interface WorkspaceProcessManagerTab {
  kind: "processManager";
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

export interface WorkspaceWorktreeManagerTab {
  kind: "worktreeManager";
  id: string;
  title: string;
  repoRoot: string;
}

export interface WorkspaceRebaseTab {
  kind: "rebase";
  id: string;
  title: string;
  repoRoot: string;
}

export interface WorkspaceMergeTab {
  kind: "merge";
  id: string;
  title: string;
  repoRoot: string;
}

export interface WorkspaceStashTab {
  kind: "stash";
  id: string;
  title: string;
  repoRoot: string;
}

export interface WorkspaceAiPreflightTab {
  kind: "aiPreflight";
  id: string;
  title: string;
  repoRoot: string;
}

export type WorkspaceTab =
  | WorkspaceTerminalTab
  | WorkspacePullRequestsTab
  | WorkspaceBranchManagerTab
  | WorkspaceIssuesTab
  | WorkspaceDockerManagerTab
  | WorkspaceProcessManagerTab
  | WorkspaceSshSftpTab
  | WorkspaceSettingsTab
  | WorkspaceWorktreeManagerTab
  | WorkspaceRebaseTab
  | WorkspaceMergeTab
  | WorkspaceStashTab
  | WorkspaceAiPreflightTab;

export function isTerminalTab(tab: WorkspaceTab): tab is WorkspaceTerminalTab {
  return tab.kind === "terminal";
}

export interface FeatureSidebarEntry {
  entryId: string;
  tabId: string;
  kind: "pullRequests" | "branchManager" | "issues" | "docker" | "processManager" | "sshSftp" | "settings" | "worktreeManager";
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
  | "move-to-group"
  | "new-group-and-move"
  | "close-tab"
  | "close-other-tabs"
  | "close-tabs-below"
  | "save-as-profile"
  | "split-pane";

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
  gitRepoRoot: string | null;
  gitIsWorktree: boolean;
  gitChangedFiles: number;
  gitAdditions: number;
  gitDeletions: number;
  isActive: boolean;
  activeProcessName?: string | null;
  activeProcessCmd?: string | null;
  hasUnseenNotification: boolean;
  agentStatus: AgentSemanticStatus;
  agentStatusSeen: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  entriesBelowCount: number;
  canCloseOthers: boolean;
  terminalTabIndex: number;
  isFirstPaneOfTab: boolean;
  groupId: string | null;
}

export type TerminalSidebarSection =
  | {
      kind: "group-header";
      groupId: string;
      name: string;
      tabCount: number;
      collapsed: boolean;
      color: TerminalEntryColor;
    }
  | {
      kind: "ungrouped-header";
      tabCount: number;
    }
  | {
      kind: "entry";
      entry: TerminalSidebarEntry;
    };

export interface SaveProfileDraft {
  label: string;
  shellId: string;
  cwd: string;
  color: TerminalEntryColor;
}

export type CreateMenuAction =
  | { kind: "default-terminal" }
  | { kind: "ungrouped-terminal" }
  | { kind: "shell"; shellId: string }
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
  sshEndpointId?: string | null;
}

export interface PersistedTerminalTab {
  title: string;
  color: TerminalEntryColor;
  split: "none" | "horizontal" | "vertical";
  groupId?: string | null;
  panes: PersistedWorkspacePane[];
}

export interface PersistedTerminalTabGroup {
  id: string;
  name: string;
  order: number;
  color?: TerminalEntryColor;
  worktreeBasePath?: string | null;
}

export interface PersistedTerminalWorkspaceV1 {
  version: 1;
  tabs: PersistedTerminalTab[];
  activeTabIndex: number;
  activePaneIndex: number;
}

export interface PersistedTerminalWorkspaceV2 {
  version: 2;
  groups: PersistedTerminalTabGroup[];
  collapsedGroupIds: string[];
  tabs: PersistedTerminalTab[];
  activeTabIndex: number;
  activePaneIndex: number;
}

export type PersistedTerminalWorkspace =
  | PersistedTerminalWorkspaceV1
  | PersistedTerminalWorkspaceV2;
