import { expect, it, vi } from "vitest";
import { join } from "node:path";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(() => ({ on: vi.fn() })),
}));
vi.mock("node:fs", () => ({ existsSync: vi.fn(() => true), readdirSync: vi.fn() }));

it("discovers LLVM and Windows headers while preserving custom bindgen flags", async () => {
  const { execFileSync, spawn } = await import("node:child_process");
  execFileSync
    .mockReturnValueOnce("C:\\Program Files\\LLVM\\lib\\clang\\22\r\n")
    .mockReturnValueOnce("C:\\Program Files\\Visual Studio\\18\r\n")
    .mockReturnValueOnce("INCLUDE=C:\\Program Files\\MSVC\\include;C:\\Windows Kits\\ucrt;\r\n");
  vi.stubGlobal("process", {
    ...process,
    platform: "win32",
    argv: [process.execPath, "scripts/tauri.mjs", "dev"],
    env: {
      LIBCLANG_PATH: "C:\\Program Files\\LLVM\\bin",
      VULKAN_SDK: "C:\\VulkanSDK\\test",
      BINDGEN_EXTRA_CLANG_ARGS: "-DKEEP_ME=1",
    },
  });
  try {
    await import("./tauri.mjs");
    expect(execFileSync).toHaveBeenCalledWith(
      join("C:\\Program Files\\LLVM\\bin", "clang.exe"),
      ["-print-resource-dir"],
      { encoding: "utf8", windowsHide: true },
    );
    expect(spawn.mock.calls[0][2].env.BINDGEN_EXTRA_CLANG_ARGS).toBe(
      '-resource-dir="C:/Program Files/LLVM/lib/clang/22" -isystem "C:/Program Files/MSVC/include" -isystem "C:/Windows Kits/ucrt" -DKEEP_ME=1',
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
