import { describe, expect, it } from "vitest";
import {
  closeToolWindow,
  isFeatureTabKind,
  openToolWindow,
} from "./toolWindow";

describe("toolWindow state", () => {
  it("opens and replaces current tool", () => {
    let state = { openId: null as null, repoRoot: null as null };
    state = openToolWindow(state, "docker");
    expect(state).toEqual({ openId: "docker", repoRoot: null });
    state = openToolWindow(state, "process");
    expect(state.openId).toBe("process");
  });

  it("carries repoRoot for git tools", () => {
    const state = openToolWindow({ openId: null, repoRoot: null }, "pullRequests", "/repo");
    expect(state).toEqual({ openId: "pullRequests", repoRoot: "/repo" });
  });

  it("closes to null", () => {
    expect(closeToolWindow()).toEqual({ openId: null, repoRoot: null });
  });

  it("classifies feature tab kinds", () => {
    expect(isFeatureTabKind("pullRequests")).toBe(true);
    expect(isFeatureTabKind("docker")).toBe(true);
    expect(isFeatureTabKind("terminal")).toBe(false);
  });
});
