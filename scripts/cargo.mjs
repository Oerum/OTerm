import { spawn } from "node:child_process";
import { ensureWindowsLibClang } from "./windows-bindgen.mjs";

const env = { ...process.env };
ensureWindowsLibClang(env);

const child = spawn("cargo", process.argv.slice(2), { env, stdio: "inherit", windowsHide: true });
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
