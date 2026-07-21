import { CLI_AGENTS, type CliAgentId } from "./terminalAgentMode";

export type CommandPaletteCategory =
  | "actions"
  | "terminals"
  | "groups"
  | "settings"
  | "ssh"
  | "git"
  | "agents"
  | "history";

export type SettingsSectionId =
  | "application"
  | "terminal-appearance"
  | "terminal-autocomplete"
  | "sftp-transfers"
  | "key-mapping";

export type CommandPaletteAction =
  | { type: "toggle-sidebar" }
  | { type: "toggle-tools" }
  | { type: "toggle-source-control" }
  | { type: "toggle-agents" }
  | { type: "open-ssh-manager" }
  | { type: "open-docker" }
  | { type: "open-process" }
  | { type: "open-settings"; section?: SettingsSectionId }
  | { type: "new-terminal"; ungrouped?: boolean }
  | { type: "reopen-terminal" }
  | { type: "select-terminal"; tabId: string; paneId: string }
  | { type: "select-group"; groupId: string | null }
  | { type: "open-ssh-host"; endpointId: string }
  | {
      type: "open-git";
      surface:
        | "source-control"
        | "prs"
        | "issues"
        | "branches"
        | "worktrees"
        | "stash"
        | "rebase"
        | "merge";
    }
  | { type: "launch-agent"; agentId: CliAgentId }
  | { type: "run-history"; command: string }
  | { type: "toggle-composer" }
  | { type: "split-horizontal" }
  | { type: "split-vertical" }
  | { type: "focus-active-terminal" }
  | { type: "block-copy" }
  | { type: "block-rerun" }
  | { type: "block-prev-failure" };

export interface CommandPaletteItem {
  id: string;
  category: CommandPaletteCategory;
  label: string;
  keywords: string;
  hint?: string;
  action: CommandPaletteAction;
}

export interface CommandPaletteBuildContext {
  terminalEntries: Array<{
    tabId: string;
    paneId: string;
    title: string;
    subtitle: string;
    cwd: string | null | undefined;
  }>;
  groups: Array<{ id: string; name: string; tabCount: number }>;
  hasUngroupedTabs: boolean;
  sshEndpoints: Array<{
    id: string;
    label: string;
    host: string;
    username: string;
    tags: string[];
  }>;
  historyCommands: string[];
  canOpenGitFeatures: boolean;
  canReopenClosed: boolean;
}

export const SETTINGS_PALETTE_SECTIONS: Array<{
  id: SettingsSectionId;
  label: string;
  description: string;
}> = [
  {
    id: "terminal-appearance",
    label: "Terminal appearance",
    description: "Themes, blocks, and command colors",
  },
  {
    id: "terminal-autocomplete",
    label: "Terminal autocomplete",
    description: "AI command suggestions in the terminal",
  },
  {
    id: "sftp-transfers",
    label: "SFTP transfers",
    description: "Parallel file transfers and size limits",
  },
  {
    id: "key-mapping",
    label: "Key mapping",
    description: "Custom application shortcuts",
  },
  {
    id: "application",
    label: "About",
    description: "Version, updates, and app info",
  },
];

function action(
  id: string,
  label: string,
  keywords: string,
  actionValue: CommandPaletteAction,
  hint = "Actions",
): CommandPaletteItem {
  return { id, category: "actions", label, keywords, hint, action: actionValue };
}

export function buildCommandPaletteItems(ctx: CommandPaletteBuildContext): CommandPaletteItem[] {
  const items: CommandPaletteItem[] = [
    action("action:toggle-sidebar", "Toggle Sidebar", "sidebar panel", { type: "toggle-sidebar" }),
    action("action:toggle-tools", "Toggle Tools", "tools panel", { type: "toggle-tools" }),
    action("action:toggle-agents", "Toggle Agent Ops", "agents ops board", { type: "toggle-agents" }),
    action("action:toggle-composer", "Toggle Agent Composer", "composer message agent", {
      type: "toggle-composer",
    }),
    action("action:split-horizontal", "Split Terminal Horizontal", "split pane", {
      type: "split-horizontal",
    }),
    action("action:split-vertical", "Split Terminal Vertical", "split pane vertical", {
      type: "split-vertical",
    }),
    action("action:focus-active-terminal", "Focus Active Terminal", "focus pane", {
      type: "focus-active-terminal",
    }),
    action("action:block-copy", "Block: Copy", "block copy output", { type: "block-copy" }),
    action("action:block-rerun", "Block: Rerun", "block rerun command", { type: "block-rerun" }),
    action("action:block-prev-failure", "Block: Jump to last failure", "block failure jump", {
      type: "block-prev-failure",
    }),
    action(
      "action:toggle-source-control",
      "Toggle Source Control",
      "git scm",
      { type: "toggle-source-control" },
    ),
    action(
      "action:open-ssh-manager",
      "Open SSH/SFTP Manager",
      "ssh sftp connections",
      { type: "open-ssh-manager" },
    ),
    action("action:open-docker", "Open Docker Manager", "containers docker", {
      type: "open-docker",
    }),
    action("action:open-process", "Open Process Manager", "processes", {
      type: "open-process",
    }),
    action("action:open-settings", "Open Settings", "preferences", {
      type: "open-settings",
    }),
    action("action:new-terminal", "New Terminal (Grouped)", "shell tab", {
      type: "new-terminal",
    }),
    action(
      "action:new-terminal-ungrouped",
      "New Terminal (Ungrouped)",
      "shell tab",
      { type: "new-terminal", ungrouped: true },
    ),
  ];

  if (ctx.canReopenClosed) {
    items.push(
      action("action:reopen-terminal", "Reopen Closed Terminal", "restore session", {
        type: "reopen-terminal",
      }),
    );
  }

  if (ctx.canOpenGitFeatures) {
    items.push(
      {
        id: "git:source-control",
        category: "git",
        label: "Git: Source Control",
        keywords: "scm changes diff",
        hint: "Git",
        action: { type: "open-git", surface: "source-control" },
      },
      {
        id: "git:prs",
        category: "git",
        label: "Git: Pull Requests",
        keywords: "pr github",
        hint: "Git",
        action: { type: "open-git", surface: "prs" },
      },
      {
        id: "git:issues",
        category: "git",
        label: "Git: Issues",
        keywords: "github bugs",
        hint: "Git",
        action: { type: "open-git", surface: "issues" },
      },
      {
        id: "git:branches",
        category: "git",
        label: "Git: Branch Manager",
        keywords: "checkout switch",
        hint: "Git",
        action: { type: "open-git", surface: "branches" },
      },
      {
        id: "git:worktrees",
        category: "git",
        label: "Git: Worktrees",
        keywords: "worktree",
        hint: "Git",
        action: { type: "open-git", surface: "worktrees" },
      },
      {
        id: "git:stash",
        category: "git",
        label: "Git: Stash",
        keywords: "stash",
        hint: "Git",
        action: { type: "open-git", surface: "stash" },
      },
      {
        id: "git:rebase",
        category: "git",
        label: "Git: Rebase",
        keywords: "rebase",
        hint: "Git",
        action: { type: "open-git", surface: "rebase" },
      },
      {
        id: "git:merge",
        category: "git",
        label: "Git: Merge",
        keywords: "merge",
        hint: "Git",
        action: { type: "open-git", surface: "merge" },
      },
    );
  }

  for (const section of SETTINGS_PALETTE_SECTIONS) {
    items.push({
      id: `settings:${section.id}`,
      category: "settings",
      label: `Settings: ${section.label}`,
      keywords: `${section.description} preferences`,
      hint: "Settings",
      action: { type: "open-settings", section: section.id },
    });
  }

  for (const entry of ctx.terminalEntries) {
    items.push({
      id: `terminal:${entry.tabId}:${entry.paneId}`,
      category: "terminals",
      label: entry.title,
      keywords: [entry.subtitle, entry.cwd ?? ""].filter(Boolean).join(" "),
      hint: "Terminals",
      action: { type: "select-terminal", tabId: entry.tabId, paneId: entry.paneId },
    });
  }

  for (const group of ctx.groups) {
    items.push({
      id: `group:${group.id}`,
      category: "groups",
      label: group.name,
      keywords: `group ${group.tabCount} tabs`,
      hint: "Groups",
      action: { type: "select-group", groupId: group.id },
    });
  }

  if (ctx.hasUngroupedTabs) {
    items.push({
      id: "group:ungrouped",
      category: "groups",
      label: "Ungrouped",
      keywords: "group no group",
      hint: "Groups",
      action: { type: "select-group", groupId: null },
    });
  }

  for (const endpoint of ctx.sshEndpoints) {
    items.push({
      id: `ssh:${endpoint.id}`,
      category: "ssh",
      label: endpoint.label || endpoint.host,
      keywords: [endpoint.host, endpoint.username, ...endpoint.tags].join(" "),
      hint: "SSH",
      action: { type: "open-ssh-host", endpointId: endpoint.id },
    });
  }

  for (const agent of CLI_AGENTS) {
    items.push({
      id: `agent:${agent.id}`,
      category: "agents",
      label: `Launch ${agent.displayName}`,
      keywords: `${agent.id} ${agent.commandPrefixes.join(" ")} agent`,
      hint: "Agents",
      action: { type: "launch-agent", agentId: agent.id },
    });
  }

  // Cap at 50; empty-query "all" mode still keeps actions visible via fuzzy filter order.
  for (const command of ctx.historyCommands.slice(0, 50)) {
    items.push({
      id: `history:${command}`,
      category: "history",
      label: command,
      keywords: `history recent command ${command}`,
      hint: "Recent",
      action: { type: "run-history", command },
    });
  }

  return items;
}
