import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appToastActivity,
  appToasts,
  dismissAppToast,
  pushAppToast,
  setAppToastActivity,
} from "./appToast";

describe("appToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    while (appToasts.value.length > 0) {
      dismissAppToast(appToasts.value[0].id);
    }
    setAppToastActivity(null);
    vi.clearAllTimers();
  });

  it("removes a toast when dismissed manually", () => {
    pushAppToast("Switch blocked", "error");
    expect(appToasts.value).toHaveLength(1);

    dismissAppToast(appToasts.value[0].id);
    expect(appToasts.value).toHaveLength(0);
  });

  it("auto-dismisses success toasts after 5 seconds", () => {
    pushAppToast("Saved", "success");
    expect(appToasts.value).toHaveLength(1);
    expect(appToasts.value[0].durationMs).toBe(5_000);

    vi.advanceTimersByTime(4_999);
    expect(appToasts.value).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(appToasts.value).toHaveLength(0);
  });

  it("auto-dismisses error toasts after 20 seconds", () => {
    pushAppToast("Failed", "error");
    expect(appToasts.value).toHaveLength(1);
    expect(appToasts.value[0].durationMs).toBe(20_000);

    vi.advanceTimersByTime(19_999);
    expect(appToasts.value).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(appToasts.value).toHaveLength(0);
  });

  it("tracks in-flight activity messages", () => {
    setAppToastActivity("Pulling changes…");
    expect(appToastActivity.value).toBe("Pulling changes…");

    setAppToastActivity(null);
    expect(appToastActivity.value).toBeNull();
  });
});
