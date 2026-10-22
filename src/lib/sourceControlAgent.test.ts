import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./parseUnifiedDiff";
import {
  buildSourceControlCommitPrompt,
  buildSourceControlFeedbackPrompt,
  buildSourceControlReviewRange,
  resolveSourceControlAgentTarget,
  type SourceControlComment,
} from "./sourceControlAgent";
import type { WorkspacePane, WorkspaceTerminalTab } from "../types/terminal";

const comment: SourceControlComment = {
  id: "one",
  file: { path: "src/a.ts", staged: true, untracked: false },
  range: null,
  body: "Keep all of this feedback.",
};

describe("source control agent eligibility", () => {
  const pane: WorkspacePane = {
    id: "a", sessionId: "session", bootstrappingSessionId: null, shellId: "shell", cwd: "/repo",
    customTitle: null, activeAgentId: "agy", oscTitle: null, hasUnseenNotification: false,
    agentStatus: "idle", agentStatusSeen: true, sshEndpointId: null,
  };
  const tab: WorkspaceTerminalTab = { kind: "terminal", id: "tab", title: "Terminal", color: "none", groupId: null, panes: [pane], split: "none" };
  const context = { tab, pane, visible: true, activeCwd: "/repo", loadedCwd: "/repo", scopeKey: "pane:a", isRepo: true, repoRoot: "/repo" };

  it("resolves detected native agents using the visible pane identity", () => {
    expect(resolveSourceControlAgentTarget(context)).toEqual({
      paneId: "a", sessionId: "session", agentId: "agy", cwd: "/repo", repoRoot: "/repo", scopeKey: "pane:a",
    });
  });

  it("rejects hidden, SSH, stale-repo, tool-tab and nonmember targets", () => {
    const invalid = [
      { visible: false }, { pane: { ...pane, sshEndpointId: "ssh" } },
      { loadedCwd: "/other" }, { tab: { kind: "branchManager" as const, id: "tool", title: "Branches", repoRoot: "/repo" } },
      { tab: { ...tab, panes: [] } }, { pane: { ...pane, sessionId: null } },
      { pane: { ...pane, activeAgentId: null } }, { isRepo: false }, { scopeKey: "pane:other" },
    ];
    for (const change of invalid) expect(resolveSourceControlAgentTarget({ ...context, ...change })).toBeNull();
  });
});

describe("source control review ranges", () => {
  const hunk = parseUnifiedDiff("@@ -3,3 +3,4 @@\n context\n-old\n+new\n+extra\n tail\n").hunks[0];

  it("captures reversed new-side ranges without opposite-side lines", () => {
    expect(buildSourceControlReviewRange(hunk, "new", 4, 0)).toEqual({
      side: "new", start: 3, end: 6, hunkHeader: hunk.header,
      excerpt: "context\nnew\nextra\ntail",
    });
    expect(buildSourceControlReviewRange(hunk, "old", 0, 4)?.excerpt).toBe("context\nold\ntail");
  });

  it("rejects opposite-side endpoints, invalid indexes and marker coordinates", () => {
    expect(buildSourceControlReviewRange(hunk, "new", 1, 2)).toBeNull();
    expect(buildSourceControlReviewRange(hunk, "old", 0, 9)).toBeNull();
    const marker = parseUnifiedDiff("@@ -1 +1 @@\n-x\n+y\n\\ No newline at end of file\n").hunks[0];
    expect(buildSourceControlReviewRange(marker, "new", 2, 2)).toBeNull();
  });
});

describe("source control prompt snapshots", () => {
  it("labels every domain and preserves captured paths, ranges and full comments", () => {
    const prompt = buildSourceControlFeedbackPrompt("/repo", [
      { ...comment, range: { side: "old", start: 3, end: 5, hunkHeader: "@@ -3,3 +3,4 @@", excerpt: "old\ntext" } },
      { ...comment, id: "two", file: { ...comment.file, staged: false } },
      { ...comment, id: "three", file: { ...comment.file, staged: false, untracked: true } },
    ]);
    for (const value of ["/repo", "src/a.ts", "HEAD-to-index", "index-to-working-tree", "untracked", "old lines 3-5", "@@ -3,3 +3,4 @@", "old\ntext", comment.body, "snapshot", "current code"]) {
      expect(prompt).toContain(value);
    }
  });

  it("escapes terminal controls and safely fences embedded backticks without truncating", () => {
    const body = "prefix\x1b[201~\r\x7f\x85\n```\n" + "x".repeat(20_000);
    const prompt = buildSourceControlFeedbackPrompt("/repo\x1b", [{ ...comment, body, file: { ...comment.file, path: "a\n```\nb" } }]);
    expect(prompt).toContain("prefix\\x1b[201~\\x0d\\x7f\\x85\n```\n" + "x".repeat(20_000));
    expect(prompt).toContain("````\na\n```\nb\n````");
    expect(prompt).not.toMatch(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/);
  });

  it("normalizes only excerpt line-ending CR while escaping a mid-line CR", () => {
    const prompt = buildSourceControlFeedbackPrompt("/repo", [{ ...comment, range: {
      side: "new", start: 1, end: 2, hunkHeader: "@@ -1 +1,2 @@",
      excerpt: "first\r\nmid\rline\r",
    } }]);
    expect(prompt).toContain("first\nmid\\x0dline");
    expect(prompt).not.toContain("first\\x0d");
  });

  it("keeps large feedback with many backtick runs intact", () => {
    const body = "`text ".repeat(150_000);
    expect(buildSourceControlFeedbackPrompt("/repo", [{ ...comment, body }])).toContain(body);
  });

  it("rejects empty feedback and no staged commit paths", () => {
    expect(() => buildSourceControlFeedbackPrompt("/repo", [])).toThrow();
    expect(() => buildSourceControlFeedbackPrompt("/repo", [{ ...comment, body: " \n" }])).toThrow();
    expect(() => buildSourceControlCommitPrompt("/repo", "main", [])).toThrow();
  });

  it("requests a message only from the current staged diff with exact paths and branch", () => {
    const prompt = buildSourceControlCommitPrompt("/repo", "feature", [{
      path: "src/a.ts", status: "M", staged: true, untracked: false, additions: 1, deletions: 1,
    }]);
    for (const value of ["/repo", "feature", "src/a.ts", "git diff --cached", "only", "Do not stage", "edit", "commit", "push"]) expect(prompt).toContain(value);
  });
});
