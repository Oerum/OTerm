import { invoke } from "@tauri-apps/api/core";
import type { GitStatus } from "../types/git";

export function getGitStatus(path?: string): Promise<GitStatus> {
  return invoke<GitStatus>("git_status", { path: path ?? null });
}
