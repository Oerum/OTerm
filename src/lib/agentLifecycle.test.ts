import { afterEach, describe, expect, it, vi } from "vitest";
import { appToasts } from "./appToast";
import {
  buildAgentEndedMessage,
  clearAgentLifecycleDedupe,
  notifyAgentEnded,
  shouldSuppressReadyNotification,
  shouldTreatAgentPollClearAsCrash,
} from "./agentLifecycle";

describe("shouldTreatAgentPollClearAsCrash", () => {
  it("detects crash when agent clears while session is alive", () => {
    expect(
      shouldTreatAgentPollClearAsCrash({
        previousAgentId: "cursor",
        nextAgentId: null,
        sessionAlive: true,
        cleanExitPending: false,
      }),
    ).toBe(true);
  });

  it("ignores clean exit handshakes", () => {
    expect(
      shouldTreatAgentPollClearAsCrash({
        previousAgentId: "cursor",
        nextAgentId: null,
        sessionAlive: true,
        cleanExitPending: true,
      }),
    ).toBe(false);
  });

  it("ignores when session already ended", () => {
    expect(
      shouldTreatAgentPollClearAsCrash({
        previousAgentId: "cursor",
        nextAgentId: null,
        sessionAlive: false,
        cleanExitPending: false,
      }),
    ).toBe(false);
  });
});

describe("buildAgentEndedMessage", () => {
  it("formats crash copy", () => {
    expect(buildAgentEndedMessage("cursor", "crash")).toBe(
      "Cursor exited unexpectedly",
    );
  });

  it("includes exit code when present", () => {
    expect(buildAgentEndedMessage("cursor", "session_ended", 1)).toBe(
      "Cursor session ended (code 1)",
    );
  });
});

describe("notifyAgentEnded", () => {
  afterEach(() => {
    appToasts.value = [];
    clearAgentLifecycleDedupe("pane-1");
    vi.restoreAllMocks();
  });

  it("pushes an error toast on crash", () => {
    notifyAgentEnded("pane-1", "cursor", "crash");
    expect(appToasts.value).toHaveLength(1);
    expect(appToasts.value[0]?.variant).toBe("error");
    expect(appToasts.value[0]?.message).toContain("Cursor");
  });

  it("dedupes repeated notifications for the same pane", () => {
    notifyAgentEnded("pane-1", "cursor", "crash");
    notifyAgentEnded("pane-1", "cursor", "crash");
    expect(appToasts.value).toHaveLength(1);
  });

  it("skips clean exits", () => {
    notifyAgentEnded("pane-1", "cursor", "clean_exit");
    expect(appToasts.value).toHaveLength(0);
  });

  it("suppresses ready notifications shortly after crash", () => {
    notifyAgentEnded("pane-1", "cursor", "crash");
    expect(shouldSuppressReadyNotification("pane-1")).toBe(true);
    clearAgentLifecycleDedupe("pane-1");
    expect(shouldSuppressReadyNotification("pane-1")).toBe(false);
  });
});
