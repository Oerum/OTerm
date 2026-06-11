import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveWhisperBackend,
  whisperCargoFeature,
} from "./whisper-backend.mjs";

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

function argsIncludeFeatures(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--features" || args[i] === "-F") {
      return true;
    }
    if (args[i].startsWith("--features=")) {
      return true;
    }
  }
  return false;
}

function injectWhisperFeature(args, feature) {
  if (argsIncludeFeatures(args)) {
    return args;
  }

  console.log(`Using Whisper backend feature: ${feature}`);
  return [...args, "--features", feature];
}

function ensureWindowsLibClang(env) {
  const libClangPath = findLibClangPath();
  if (!libClangPath) {
    console.error(
      "LIBCLANG_PATH is not set and LLVM/libclang was not found in the default install paths.",
    );
    console.error("Install LLVM, then retry or set LIBCLANG_PATH manually.");
    process.exit(1);
  }
  env.LIBCLANG_PATH = libClangPath;
}

function ensureWindowsVulkanEnv(env) {
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
  env.Vulkan_INCLUDE_DIR = join(vulkanSdk, "Include");
  env.Vulkan_LIBRARY = join(vulkanSdk, "Lib", "vulkan-1.lib");
  env.CMAKE_PREFIX_PATH = env.CMAKE_PREFIX_PATH
    ? `${vulkanSdk};${env.CMAKE_PREFIX_PATH}`
    : vulkanSdk;

  if (!env.CARGO_TARGET_DIR) {
    env.CARGO_TARGET_DIR = "C:\\oterm-t";
  }
}

function ensureWindowsNativeEnv(env, backend) {
  if (process.platform !== "win32") {
    return;
  }

  ensureWindowsLibClang(env);

  if (backend === "vulkan") {
    ensureWindowsVulkanEnv(env);
  }
}

let whisperBackend;
try {
  whisperBackend = resolveWhisperBackend();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const env = { ...process.env };
ensureWindowsNativeEnv(env, whisperBackend);

let args = process.argv.slice(2);
args = injectWhisperFeature(args, whisperCargoFeature(whisperBackend));

if (args.includes("build") && !env.TAURI_SIGNING_PRIVATE_KEY && !env.TAURI_PRIVATE_KEY) {
  console.log("TAURI_SIGNING_PRIVATE_KEY not set. Disabling updater artifacts for this local build.");
  let configIndex = -1;
  let configValue = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-c" || args[i] === "--config") {
      configIndex = i;
      if (i + 1 < args.length) {
        configValue = args[i + 1];
      }
      break;
    } else if (args[i].startsWith("-c=")) {
      configIndex = i;
      configValue = args[i].slice(3);
      break;
    } else if (args[i].startsWith("--config=")) {
      configIndex = i;
      configValue = args[i].slice(9);
      break;
    }
  }

  let mergedConfig = { bundle: { createUpdaterArtifacts: false } };
  if (configIndex !== -1 && configValue) {
    try {
      const existingConfig = JSON.parse(configValue);
      mergedConfig = {
        ...existingConfig,
        bundle: {
          ...existingConfig.bundle,
          createUpdaterArtifacts: false
        }
      };
    } catch (e) {
      console.warn("Failed to parse existing --config argument, overriding it.");
    }
  }

  if (configIndex !== -1) {
    if (args[configIndex].includes("=")) {
      const flag = args[configIndex].startsWith("-c=") ? "-c=" : "--config=";
      args[configIndex] = flag + JSON.stringify(mergedConfig);
    } else {
      args[configIndex + 1] = JSON.stringify(mergedConfig);
    }
  } else {
    args.push("-c", JSON.stringify(mergedConfig));
  }
}

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
