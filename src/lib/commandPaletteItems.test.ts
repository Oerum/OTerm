import { describe, expect, it } from "vitest";
import { buildCommandPaletteItems } from "./commandPaletteItems";

const emptyCtx = {
  terminalEntries: [],
  groups: [],
  hasUngroupedTabs: false,
  sshEndpoints: [],
  historyCommands: [],
  canOpenGitFeatures: false,
  canReopenClosed: false,
};

describe("buildCommandPaletteItems", () => {
  it("always includes core navigation actions", () => {
    const items = buildCommandPaletteItems(emptyCtx);
    const ids = items.map((i) => i.id);
    expect(ids).toContain("action:open-settings");
    expect(ids).toContain("action:toggle-sidebar");
    expect(ids).toContain("settings:key-mapping");
  });

  it("omits git surfaces when canOpenGitFeatures is false", () => {
    const items = buildCommandPaletteItems(emptyCtx);
    expect(items.some((i) => i.category === "git")).toBe(false);
  });

  it("includes git surfaces when allowed", () => {
    const items = buildCommandPaletteItems({ ...emptyCtx, canOpenGitFeatures: true });
    expect(items.some((i) => i.id === "git:source-control")).toBe(true);
    expect(items.some((i) => i.id === "git:prs")).toBe(true);
  });

  it("builds terminal and ssh items from context", () => {
    const items = buildCommandPaletteItems({
      ...emptyCtx,
      terminalEntries: [
        {
          tabId: "t1",
          paneId: "p1",
          title: "oterm",
          subtitle: "pwsh · C:\\Users\\Filip\\Desktop\\oterm",
          cwd: "C:\\Users\\Filip\\Desktop\\oterm",
        },
      ],
      sshEndpoints: [
        { id: "e1", label: "prod", host: "10.0.0.1", username: "ubuntu", tags: ["prod"] },
      ],
    });
    expect(items.some((i) => i.id === "terminal:t1:p1")).toBe(true);
    expect(items.some((i) => i.id === "ssh:e1")).toBe(true);
  });

  it("caps empty-query history and includes agents", () => {
    const historyCommands = Array.from({ length: 40 }, (_, i) => `cmd-${i}`);
    const items = buildCommandPaletteItems({ ...emptyCtx, historyCommands });
    const history = items.filter((i) => i.category === "history");
    expect(history.length).toBeLessThanOrEqual(50);
    expect(items.some((i) => i.category === "agents")).toBe(true);
  });

  it("includes more history when many commands exist", () => {
    const historyCommands = Array.from({ length: 80 }, (_, i) => `cmd-${i}`);
    const items = buildCommandPaletteItems({ ...emptyCtx, historyCommands });
    const history = items.filter((i) => i.category === "history");
    expect(history.length).toBeGreaterThan(20);
    expect(history.length).toBe(50);
  });

  it("exposes chrome-diet leftover actions", () => {
    const items = buildCommandPaletteItems({ ...emptyCtx, canOpenGitFeatures: true });
    const ids = items.map((i) => i.id);
    expect(ids).toContain("action:toggle-composer");
    expect(ids).toContain("action:split-horizontal");
    expect(ids).toContain("action:focus-active-terminal");
    expect(ids).toContain("action:block-copy");
    expect(ids).toContain("action:block-rerun");
    expect(ids).toContain("action:block-prev-failure");
    expect(ids).toContain("git:worktrees");
    expect(ids).toContain("git:stash");
    expect(ids).toContain("git:rebase");
    expect(ids).toContain("git:merge");
  });

  it("omits reopen when canReopenClosed is false", () => {
    const items = buildCommandPaletteItems(emptyCtx);
    expect(items.some((i) => i.id === "action:reopen-terminal")).toBe(false);
  });

  it("does not expose a chat toggle action", () => {
    const items = buildCommandPaletteItems(emptyCtx);
    expect(items.some((i) => i.id === "action:toggle-chat")).toBe(false);
    expect(items.some((i) => (i.action.type as string) === "toggle-chat")).toBe(false);
  });
});
