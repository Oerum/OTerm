import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function findLibClangPath(env) {
  const current = env.LIBCLANG_PATH;
  if (current && existsSync(join(current, "libclang.dll"))) {
    return current;
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

export function ensureWindowsLibClang(env) {
  if (process.platform !== "win32") return;

  const libClangPath = findLibClangPath(env);
  if (!libClangPath) {
    throw new Error("Install LLVM or set LIBCLANG_PATH to the directory containing libclang.dll.");
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
