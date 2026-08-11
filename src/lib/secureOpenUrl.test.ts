import { beforeEach, describe, expect, it, vi } from "vitest";

const { tauriOpenUrlMock } = vi.hoisted(() => ({
  tauriOpenUrlMock: vi.fn<(url: string) => Promise<void>>(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: tauriOpenUrlMock,
}));

import { openUrl } from "./secureOpenUrl";

describe("secureOpenUrl", () => {
  beforeEach(() => {
    tauriOpenUrlMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("allows http, https, and mailto URLs", async () => {
    tauriOpenUrlMock.mockResolvedValue();

    await openUrl("https://github.com/Oerum/OTerm");
    expect(tauriOpenUrlMock).toHaveBeenCalledWith("https://github.com/Oerum/OTerm");

    await openUrl("http://example.com");
    expect(tauriOpenUrlMock).toHaveBeenCalledWith("http://example.com/");

    await openUrl("mailto:test@example.com");
    expect(tauriOpenUrlMock).toHaveBeenCalledWith("mailto:test@example.com");
  });

  it("blocks dangerous or unknown schemes", async () => {
    await openUrl("file:///C:/Windows/System32/cmd.exe");
    expect(tauriOpenUrlMock).not.toHaveBeenCalled();

    await openUrl("javascript:alert(1)");
    expect(tauriOpenUrlMock).not.toHaveBeenCalled();

    await openUrl("custom-scheme://do-something");
    expect(tauriOpenUrlMock).not.toHaveBeenCalled();
  });

  it("resolves relative URLs against baseUrl and passes parsed.href to tauri openUrl", async () => {
    tauriOpenUrlMock.mockResolvedValue();

    await openUrl("/path/to/resource", "https://example.com");
    expect(tauriOpenUrlMock).toHaveBeenCalledWith("https://example.com/path/to/resource");
  });

  it("handles malformed URLs gracefully", async () => {
    await openUrl("http://");
    expect(tauriOpenUrlMock).not.toHaveBeenCalled();
  });

  it("propagates errors thrown by tauri openUrl", async () => {
    tauriOpenUrlMock.mockRejectedValue(new Error("Browser launch failed"));

    await expect(openUrl("https://example.com")).rejects.toThrow("Browser launch failed");
  });
});
