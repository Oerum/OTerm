import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

import { open } from "@tauri-apps/plugin-dialog";
import { pickJsonFile } from "./pickJsonFile";

describe("pickJsonFile", () => {
  it("returns a single path and rejects cancel/multi", async () => {
    vi.mocked(open).mockResolvedValueOnce("C:/themes/a.json");
    await expect(pickJsonFile()).resolves.toBe("C:/themes/a.json");

    vi.mocked(open).mockResolvedValueOnce(null);
    await expect(pickJsonFile()).resolves.toBeNull();

    vi.mocked(open).mockResolvedValueOnce(["a.json", "b.json"]);
    await expect(pickJsonFile()).resolves.toBeNull();
  });
});
