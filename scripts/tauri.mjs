import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveWhisperBackend,
  whisperBackendFromArgs,
  whisperCargoFeature,
} from "./whisper-backend.mjs";
import { updaterEndpointForBackend, usesAlternateUpdaterChannel } from "./updater-manifest.mjs";

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
  // libclang may not locate its builtin headers when loaded by a Cargo build script.
  const resourceDir = execFileSync(join(libClangPath, "clang.exe"), ["-print-resource-dir"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  if (!existsSync(join(resourceDir, "include", "stdbool.h"))) {
    throw new Error(`LLVM builtin headers are missing from ${resourceDir}. Reinstall LLVM.`);
  }
  // LLVM may not discover newer Visual Studio installations on its own.
  let includes = env.INCLUDE;
  if (!includes) {
    const vswhere = join(env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
      "Microsoft Visual Studio", "Installer", "vswhere.exe");
    const visualStudio = execFileSync(vswhere, [
      "-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-property", "installationPath",
    ], { encoding: "utf8", windowsHide: true }).trim();
    if (!visualStudio) {
      throw new Error("Install Visual Studio C++ build tools and a Windows SDK, then retry.");
    }
    const devCommand = join(visualStudio, "Common7", "Tools", "VsDevCmd.bat");
    const output = execFileSync("cmd.exe", [
      "/d", "/s", "/c", `"call "${devCommand}" -no_logo >nul && set INCLUDE"`,
    ], { encoding: "utf8", windowsHide: true, windowsVerbatimArguments: true });
    includes = output.match(/^INCLUDE=(.*)$/mi)?.[1].trim();
    if (!includes) {
      throw new Error("Visual Studio did not provide C/C++ header paths. Check the Windows SDK installation.");
    }
  }
  env.BINDGEN_EXTRA_CLANG_ARGS = [
    `-resource-dir="${resourceDir.replaceAll("\\", "/")}"`,
    ...includes.split(";").filter(Boolean).map((path) => `-isystem "${path.replaceAll("\\", "/")}"`),
    env.BINDGEN_EXTRA_CLANG_ARGS,
  ].filter(Boolean).join(" ");
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

let args = process.argv.slice(2);
let whisperBackend;
try {
  whisperBackend = whisperBackendFromArgs(args) ?? resolveWhisperBackend();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const env = { ...process.env };
ensureWindowsNativeEnv(env, whisperBackend);
args = injectWhisperFeature(args, whisperCargoFeature(whisperBackend));

function readConfigArg(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-c" || args[i] === "--config") {
      return { index: i, value: args[i + 1] ?? "", inline: false };
    }
    if (args[i].startsWith("-c=")) {
      return { index: i, value: args[i].slice(3), inline: true, flag: "-c=" };
    }
    if (args[i].startsWith("--config=")) {
      return { index: i, value: args[i].slice(9), inline: true, flag: "--config=" };
    }
  }
  return { index: -1, value: "", inline: false };
}

function writeConfigArg(args, configIndex, config, inline, flag) {
  const serialized = JSON.stringify(config);
  if (configIndex === -1) {
    args.push("-c", serialized);
    return;
  }
  if (inline) {
    args[configIndex] = `${flag}${serialized}`;
    return;
  }
  args[configIndex + 1] = serialized;
}

if (args.includes("build")) {
  const hasSigningKey = Boolean(env.TAURI_SIGNING_PRIVATE_KEY || env.TAURI_PRIVATE_KEY);
  const { index: configIndex, value: configValue, inline, flag } = readConfigArg(args);

  let mergedConfig = {};
  if (configValue) {
    try {
      mergedConfig = JSON.parse(configValue);
    } catch {
      console.warn("Failed to parse existing --config argument, overriding it.");
    }
  }

  mergedConfig.bundle = {
    ...mergedConfig.bundle,
    createUpdaterArtifacts: hasSigningKey,
  };

  if (usesAlternateUpdaterChannel(whisperBackend)) {
    mergedConfig.plugins = {
      ...mergedConfig.plugins,
      updater: {
        ...mergedConfig.plugins?.updater,
        endpoints: [updaterEndpointForBackend(whisperBackend)],
      },
    };
  }

  if (!hasSigningKey) {
    console.log("TAURI_SIGNING_PRIVATE_KEY not set. Disabling updater artifacts for this local build.");
  }

  writeConfigArg(args, configIndex, mergedConfig, inline, flag);
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
