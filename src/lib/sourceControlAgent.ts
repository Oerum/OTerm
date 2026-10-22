import type { GitFileEntry, SelectedGitFile } from "../types/git";
import type { WorkspacePane, WorkspaceTab } from "../types/terminal";
import type { DiffHunk } from "./parseUnifiedDiff";
import type { CliAgentId } from "./terminalAgentMode";

export interface SourceControlAgentTarget {
  paneId: string;
  sessionId: string;
  agentId: CliAgentId;
  cwd: string;
  repoRoot: string;
  scopeKey: string;
}

export interface SourceControlReviewRange {
  side: "old" | "new";
  start: number;
  end: number;
  hunkHeader: string;
  excerpt: string;
}

export interface SourceControlComment {
  id: string;
  file: SelectedGitFile;
  range: SourceControlReviewRange | null;
  body: string;
}

export interface SourceControlReviewDraft {
  comments: SourceControlComment[];
  editor: {
    id: string | null;
    file: SelectedGitFile | null;
    range: SourceControlReviewRange | null;
    body: string;
  };
}

export interface SourceControlAgentRequest {
  scopeKey: string;
  repoRoot: string;
  prompt: string;
}

export function resolveSourceControlAgentTarget(context: {
  tab: WorkspaceTab | null;
  pane: WorkspacePane | null;
  visible: boolean;
  activeCwd: string | undefined;
  loadedCwd: string | null | undefined;
  scopeKey: string | null;
  isRepo: boolean;
  repoRoot: string | null;
}): SourceControlAgentTarget | null {
  const { tab, pane, scopeKey, repoRoot } = context;
  if (!context.visible || tab?.kind !== "terminal" || !pane ||
    !tab.panes.some((entry) => entry.id === pane.id) || pane.sshEndpointId ||
    !pane.sessionId || !pane.activeAgentId || !pane.cwd || pane.cwd !== context.activeCwd ||
    context.loadedCwd !== context.activeCwd || !context.isRepo || !repoRoot ||
    scopeKey !== `pane:${pane.id}`) return null;
  return { paneId: pane.id, sessionId: pane.sessionId, agentId: pane.activeAgentId, cwd: pane.cwd, repoRoot, scopeKey };
}

export function sameSourceControlAgentTarget(
  expected: SourceControlAgentTarget,
  current: SourceControlAgentTarget | null | undefined,
): boolean {
  return Boolean(current && expected.paneId === current.paneId &&
    expected.sessionId === current.sessionId && expected.agentId === current.agentId &&
    expected.cwd === current.cwd && expected.repoRoot === current.repoRoot &&
    expected.scopeKey === current.scopeKey);
}

export function buildSourceControlReviewRange(
  hunk: DiffHunk,
  side: "old" | "new",
  anchorLineIndex: number,
  endLineIndex: number,
): SourceControlReviewRange | null {
  const coordinate = side === "old" ? "oldLine" : "newLine";
  const anchor = hunk.lines[anchorLineIndex]?.[coordinate];
  const end = hunk.lines[endLineIndex]?.[coordinate];
  if (!Number.isInteger(anchor) || !Number.isInteger(end) || !anchor || !end) return null;
  const lines = hunk.lines.slice(Math.min(anchorLineIndex, endLineIndex), Math.max(anchorLineIndex, endLineIndex) + 1)
    .filter((line) => line[coordinate] != null);
  return {
    side, start: Math.min(anchor, end), end: Math.max(anchor, end),
    hunkHeader: hunk.header, excerpt: lines.map((line) => line.text).join("\n"),
  };
}

function promptBlock(value: string): string {
  const text = value.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,
    (character) => `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`);
  let longestRun = 0;
  for (const match of text.matchAll(/`+/g)) longestRun = Math.max(longestRun, match[0].length);
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}\n${text}\n${fence}`;
}

export function buildSourceControlFeedbackPrompt(
  repoRoot: string,
  comments: readonly SourceControlComment[],
): string {
  if (!comments.length || comments.some((comment) => !comment.body.trim())) {
    throw new Error("Add review feedback before exporting.");
  }
  return [
    "Review feedback for repository:", promptBlock(repoRoot),
    "These comments capture a snapshot that may differ from current code. Verify the current code and diff before acting on each comment.",
    ...comments.flatMap((comment, index) => {
      const domain = comment.file.untracked ? "untracked" : comment.file.staged ? "HEAD-to-index" : "index-to-working-tree";
      const range = comment.range;
      return [
        `Comment ${index + 1} (${domain})`, "Relative path:", promptBlock(comment.file.path),
        ...(range ? [
          `${range.side} lines ${range.start}-${range.end}`, "Hunk:", promptBlock(range.hunkHeader),
          "Captured excerpt:", promptBlock(range.excerpt.split("\n").map((line) => line.replace(/\r$/, "")).join("\n")),
        ] : ["File comment"]),
        "Feedback:", promptBlock(comment.body),
      ];
    }),
  ].join("\n\n");
}

export function buildSourceControlCommitPrompt(
  repoRoot: string,
  branch: string | null,
  staged: readonly GitFileEntry[],
): string {
  if (!staged.length) throw new Error("Stage changes before requesting a commit message.");
  return [
    "Draft a commit message for repository:", promptBlock(repoRoot),
    "Branch:", promptBlock(branch ?? "(detached HEAD)"),
    "Current staged paths:", ...staged.map((file) => promptBlock(file.path)),
    "Inspect the current git diff --cached in this repository. Return only the proposed commit message for me to copy. Do not stage, edit files, commit, or push.",
  ].join("\n\n");
}
