import { describe, expect, it } from "vitest";
import {
  appendOutputTail,
  agentStatusLabel,
  classifyAgentStatus,
  displayAgentStatus,
} from "./agentStatus";

describe("classifyAgentStatus", () => {
  it("returns unknown when no agent is active", () => {
    expect(
      classifyAgentStatus({
        activeAgentId: null,
        outputTail: "",
        oscTitle: null,
        hasRecentOutput: false,
      }),
    ).toBe("unknown");
  });

  it("detects blocked from approval prompts", () => {
    expect(
      classifyAgentStatus({
        activeAgentId: "claude",
        outputTail: "Allow this tool to run? [Y/n]",
        oscTitle: null,
        hasRecentOutput: true,
      }),
    ).toBe("blocked");
  });

  it("detects working from recent output", () => {
    expect(
      classifyAgentStatus({
        activeAgentId: "claude",
        outputTail: "Reading files…",
        oscTitle: null,
        hasRecentOutput: true,
      }),
    ).toBe("working");
  });

  it("detects working from OSC title", () => {
    expect(
      classifyAgentStatus({
        activeAgentId: "claude",
        outputTail: "",
        oscTitle: "Fix auth bug",
        hasRecentOutput: false,
      }),
    ).toBe("working");
  });

  it("defaults active agent to working when quiet", () => {
    expect(
      classifyAgentStatus({
        activeAgentId: "claude",
        outputTail: "",
        oscTitle: null,
        hasRecentOutput: false,
      }),
    ).toBe("working");
  });
});

describe("displayAgentStatus", () => {
  it("maps unseen idle to done", () => {
    expect(displayAgentStatus("idle", false)).toBe("done");
    expect(displayAgentStatus("idle", true)).toBe("idle");
  });
});

describe("appendOutputTail", () => {
  it("caps tail length", () => {
    const tail = appendOutputTail("a".repeat(5000), "bbb");
    expect(tail.length).toBeLessThanOrEqual(4000);
    expect(tail.endsWith("bbb")).toBe(true);
  });
});

describe("agentStatusLabel", () => {
  it("labels done distinctly from idle", () => {
    expect(agentStatusLabel("done")).toBe("Done");
    expect(agentStatusLabel("idle")).toBe("Idle");
  });
});
