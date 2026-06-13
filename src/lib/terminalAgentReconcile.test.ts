import { describe, expect, it } from "vitest";
import {
  parseDetectedCliAgentId,
  reconcileActiveAgentId,
} from "./terminalAgentReconcile";

describe("parseDetectedCliAgentId", () => {
  it("accepts known agent ids from the backend", () => {
    expect(parseDetectedCliAgentId("cursor")).toBe("cursor");
    expect(parseDetectedCliAgentId("claude")).toBe("claude");
  });

  it("rejects unknown ids", () => {
    expect(parseDetectedCliAgentId("node")).toBeNull();
    expect(parseDetectedCliAgentId(null)).toBeNull();
    expect(parseDetectedCliAgentId(undefined)).toBeNull();
  });
});

describe("reconcileActiveAgentId", () => {
  it("promotes null local state when process tree detects an agent", () => {
    expect(reconcileActiveAgentId(null, "cursor")).toBe("cursor");
  });

  it("keeps existing local agent state", () => {
    expect(reconcileActiveAgentId("claude", "cursor")).toBe("claude");
  });

  it("stays null when nothing is detected", () => {
    expect(reconcileActiveAgentId(null, null)).toBeNull();
  });
});
