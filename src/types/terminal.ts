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

export interface WorkspacePane {
  id: string;
  sessionId: string | null;
  shellId: string;
  cwd: string;
}

export interface WorkspaceTab {
  id: string;
  title: string;
  panes: WorkspacePane[];
  split: "none" | "horizontal";
}
