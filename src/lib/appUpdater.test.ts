import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

const { relaunchMock, pushAppToastMock, setAppToastActivityMock } = vi.hoisted(() => ({
  relaunchMock: vi.fn<() => Promise<void>>(),
  pushAppToastMock: vi.fn(),
  setAppToastActivityMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: relaunchMock,
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("./appToast", () => ({
  pushAppToast: pushAppToastMock,
  setAppToastActivity: setAppToastActivityMock,
}));

import { downloadAndInstallUpdate, type PendingAppUpdate } from "./appUpdater";

class FakeUpdate implements PendingAppUpdate {
  version = "1.0.0";

  #rid = 42;

  get rid() {
    return this.#rid;
  }

  async downloadAndInstall(): Promise<void> {
    void this.rid;
  }
}

describe("appUpdater", () => {
  beforeEach(() => {
    relaunchMock.mockReset();
    pushAppToastMock.mockReset();
    setAppToastActivityMock.mockReset();
    relaunchMock.mockResolvedValue();
  });

  it("fails when a reactive proxy wraps a Resource-like update object", async () => {
    const update = reactive(new FakeUpdate());

    await expect(update.downloadAndInstall()).rejects.toThrow(
      /Cannot read private member.*from an object whose class did not declare it/,
    );
  });

  it("unwraps reactive proxies before calling downloadAndInstall", async () => {
    const update = reactive(new FakeUpdate());

    await expect(downloadAndInstallUpdate(update)).resolves.toBe(true);

    expect(pushAppToastMock).toHaveBeenCalledWith("Update installed. Restarting…", "success");
    expect(relaunchMock).toHaveBeenCalledTimes(1);
    expect(setAppToastActivityMock).toHaveBeenLastCalledWith(null);
  });
});
