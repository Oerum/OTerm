import { describe, expect, it } from "vitest";
import { buildSessionRadar, type SessionRadarInput } from "./sessionRadar";

const base: SessionRadarInput = {
  activeAgentId: null,
  agentStatus: "unknown",
  agentStatusSeen: true,
  hasUnseenNotification: false,
  activeProcessCmd: null,
  gitIsRepo: false,
  gitBranch: null,
  gitChangedFiles: 0,
  sshEndpointId: null,
};

describe("buildSessionRadar", () => {
  it("returns none when idle", () => {
    const model = buildSessionRadar(base);
    expect(model.attention).toBe("none");
    expect(model.attentionRank).toBeGreaterThan(0);
    expect(model.primaryBadge).toBe("none");
  });

  it("prioritizes blocked agent over unseen output", () => {
    const model = buildSessionRadar({
      ...base,
      activeAgentId: "claude",
      agentStatus: "blocked",
      hasUnseenNotification: true,
      activeProcessCmd: "npm test",
      gitIsRepo: true,
      gitBranch: "main",
      gitChangedFiles: 3,
    });
    expect(model.attention).toBe("blocked-agent");
    expect(model.primaryBadge).toBe("agent");
    expect(model.statusLabel).toBe("blocked · main");
    expect(model.showGitDiff).toBe(true);
  });

  it("prioritizes unseen output over working agent", () => {
    const model = buildSessionRadar({
      ...base,
      activeAgentId: "claude",
      agentStatus: "working",
      hasUnseenNotification: true,
    });
    expect(model.attention).toBe("unseen-output");
  });

  it("prioritizes working agent over running process", () => {
    const model = buildSessionRadar({
      ...base,
      activeAgentId: "claude",
      agentStatus: "working",
      activeProcessCmd: "npm test",
    });
    expect(model.attention).toBe("working-agent");
  });

  it("keeps git diff badge + branch when agent is working on dirty tree", () => {
    const model = buildSessionRadar({
      ...base,
      activeAgentId: "claude",
      agentStatus: "working",
      gitIsRepo: true,
      gitBranch: "main",
      gitChangedFiles: 46,
    });
    expect(model.attention).toBe("working-agent");
    expect(model.showGitDiff).toBe(true);
    expect(model.statusLabel).toBe("working · main");
  });

  it("prefixes agent brand in subtitle so title can stay project name", () => {
    const model = buildSessionRadar({
      ...base,
      activeAgentId: "agy",
      agentDisplayName: "Agy",
      agentStatus: "working",
      gitIsRepo: true,
      gitBranch: "main",
      gitChangedFiles: 46,
    });
    expect(model.statusLabel).toBe("Agy · working · main");
  });

  it("shows idle agent brand (and branch when dirty) when no higher status", () => {
    const idle = buildSessionRadar({
      ...base,
      activeAgentId: "agy",
      agentDisplayName: "Agy",
      agentStatus: "idle",
    });
    expect(idle.attention).toBe("none");
    expect(idle.statusLabel).toBe("Agy");

    const dirtyIdle = buildSessionRadar({
      ...base,
      activeAgentId: "agy",
      agentDisplayName: "Agy",
      agentStatus: "idle",
      gitIsRepo: true,
      gitBranch: "main",
      gitChangedFiles: 2,
    });
    expect(dirtyIdle.attention).toBe("dirty-git");
    expect(dirtyIdle.statusLabel).toBe("Agy · main · 2");
  });

  it("prioritizes running process over dirty git", () => {
    const model = buildSessionRadar({
      ...base,
      activeProcessCmd: "npm test",
      gitIsRepo: true,
      gitBranch: "main",
      gitChangedFiles: 2,
    });
    expect(model.attention).toBe("running-process");
    expect(model.primaryBadge).toBe("process");
    expect(model.statusLabel).toBe("npm test · main");
    expect(model.showGitDiff).toBe(true);
  });

  it("shows dirty git when nothing higher", () => {
    const model = buildSessionRadar({
      ...base,
      gitIsRepo: true,
      gitBranch: "main",
      gitChangedFiles: 3,
    });
    expect(model.attention).toBe("dirty-git");
    expect(model.primaryBadge).toBe("git");
    expect(model.statusLabel).toBe("main · 3");
    expect(model.showGitDiff).toBe(true);
  });

  it("hides git diff when tree is clean", () => {
    const model = buildSessionRadar({
      ...base,
      gitIsRepo: true,
      gitBranch: "main",
      gitChangedFiles: 0,
    });
    expect(model.showGitDiff).toBe(false);
  });

  it("uses ssh badge when ssh session and no higher attention", () => {
    const model = buildSessionRadar({
      ...base,
      sshEndpointId: "e1",
    });
    expect(model.primaryBadge).toBe("ssh");
  });

  it("ranks blocked lower (more urgent) than dirty git", () => {
    const blocked = buildSessionRadar({
      ...base,
      activeAgentId: "claude",
      agentStatus: "blocked",
    });
    const dirty = buildSessionRadar({
      ...base,
      gitIsRepo: true,
      gitBranch: "main",
      gitChangedFiles: 1,
    });
    expect(blocked.attentionRank).toBeLessThan(dirty.attentionRank);
  });
});
