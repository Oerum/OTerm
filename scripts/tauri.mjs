import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function findVulkanSdk() {
  const current = process.env.VULKAN_SDK;
  if (current && existsSync(current)) {
    return current;
  }

  if (process.platform !== "win32") {
    return null;
  }

  const sdkRoot = "C:\\VulkanSDK";
  if (!existsSync(sdkRoot)) {
    return null;
  }

  const versions = readdirSync(sdkRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(sdkRoot, entry.name))
    .sort()
    .reverse();

  return versions[0] ?? null;
}

function findLibClangPath() {
  const current = process.env.LIBCLANG_PATH;
  if (current && existsSync(join(current, "libclang.dll"))) {
    return current;
  }

  if (process.platform !== "win32") {
    return null;
  }

  for (const candidate of [
    "C:\\Program Files\\LLVM\\bin",
    "C:\\Program Files (x86)\\LLVM\\bin",
  ]) {
    if (existsSync(join(candidate, "libclang.dll"))) {
      return candidate;
    }
  }

  return null;
}

function ensureWindowsNativeEnv(env) {
  if (process.platform !== "win32") {
    return;
  }

  const vulkanSdk = findVulkanSdk();
  if (!vulkanSdk) {
    console.error(
      "VULKAN_SDK is not set and no Vulkan SDK was found under C:\\VulkanSDK.",
    );
    console.error("Install it from https://vulkan.lunarg.com/ then retry.");
    process.exit(1);
  }
  env.VULKAN_SDK = vulkanSdk;
  env.Vulkan_ROOT = vulkanSdk;
  env.CMAKE_PREFIX_PATH = env.CMAKE_PREFIX_PATH
    ? `${vulkanSdk};${env.CMAKE_PREFIX_PATH}`
    : vulkanSdk;

  const libClangPath = findLibClangPath();
  if (!libClangPath) {
    console.error(
      "LIBCLANG_PATH is not set and LLVM/libclang was not found in the default install paths.",
    );
    console.error("Install LLVM, then retry or set LIBCLANG_PATH manually.");
    process.exit(1);
  }
  env.LIBCLANG_PATH = libClangPath;

  // whisper.cpp's Vulkan shader build can hit MAX_PATH under the repo target dir.
  if (!env.CARGO_TARGET_DIR) {
    env.CARGO_TARGET_DIR = "C:\\oterm-t";
  }
}

const env = { ...process.env };
ensureWindowsNativeEnv(env);

const args = process.argv.slice(2);
const tauriJs = join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");

const child = spawn(process.execPath, [tauriJs, ...args], {
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
