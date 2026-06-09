import { invoke } from "@tauri-apps/api/core";

export function getLaunchInitialCwd(): Promise<string | null> {
  return invoke<string | null>("launch_initial_cwd");
}
