import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(() => ({ on: vi.fn() })),
}));
vi.mock("node:fs", () => ({ existsSync: vi.fn(() => true) }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  existsSync.mockReturnValue(true);
  execFileSync.mockReturnValue("C:\\Program Files\\LLVM\\lib\\clang\\22\r\n");
  vi.stubGlobal("process", {
    ...process,
    platform: "win32",
    argv: [process.execPath, "scripts/cargo.mjs", "check", "--message-format=json", "--all-targets"],
    env: {
      LIBCLANG_PATH: "C:\\Program Files\\LLVM\\bin",
      INCLUDE: "C:\\Program Files\\MSVC\\include;C:\\Windows Kits\\ucrt;",
      BINDGEN_EXTRA_CLANG_ARGS: "-DKEEP_ME=1",
    },
    exitCode: undefined,
    kill: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("supplies Windows headers to direct Cargo checks without polluting JSON output", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./cargo.mjs");
  expect(spawn).toHaveBeenCalledWith("cargo", process.argv.slice(2), {
    env: {
      ...process.env,
      BINDGEN_EXTRA_CLANG_ARGS: '-resource-dir="C:/Program Files/LLVM/lib/clang/22" -isystem "C:/Program Files/MSVC/include" -isystem "C:/Windows Kits/ucrt" -DKEEP_ME=1',
    },
    stdio: "inherit",
    windowsHide: true,
  });
  expect(process.env.BINDGEN_EXTRA_CLANG_ARGS).toBe("-DKEEP_ME=1");
  expect(log).not.toHaveBeenCalled();
});

it.each(["linux", "darwin"])("leaves %s toolchains and explicit Cargo features unchanged", async (platform) => {
  process.platform = platform;
  process.argv.push("--features", "whisper-metal");
  await import("./cargo.mjs");
  expect(execFileSync).not.toHaveBeenCalled();
  expect(spawn).toHaveBeenCalledWith("cargo", process.argv.slice(2), expect.objectContaining({ env: process.env }));
});

it("fails before Cargo can fall back to incompatible bindings when LLVM headers are missing", async () => {
  existsSync.mockImplementation((path) => !path.endsWith("stdbool.h"));
  await expect(import("./cargo.mjs")).rejects.toThrow("LLVM builtin headers are missing");
  expect(spawn).not.toHaveBeenCalled();
});

it("propagates Cargo failures and signals", async () => {
  await import("./cargo.mjs");
  const on = spawn.mock.results[0].value.on;
  const exit = on.mock.calls.find(([event]) => event === "exit")[1];
  exit(101, null);
  expect(process.exitCode).toBe(101);
  exit(null, "SIGTERM");
  expect(process.kill).toHaveBeenCalledWith(process.pid, "SIGTERM");
});

it("reports a missing Cargo executable as a failed check", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await import("./cargo.mjs");
  spawn.mock.results[0].value.on.mock.calls.find(([event]) => event === "error")[1](new Error("spawn cargo ENOENT"));
  expect(process.exitCode).toBe(1);
  expect(error).toHaveBeenCalledWith("spawn cargo ENOENT");
});
