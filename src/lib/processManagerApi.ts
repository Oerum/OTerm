import { invoke } from "@tauri-apps/api/core";
import type { ProcessListSummary } from "../types/processManager";

export function listProcesses(): Promise<ProcessListSummary> {
  return invoke<ProcessListSummary>("process_manager_list");
}

export function killProcess(pid: number): Promise<void> {
  return invoke<void>("process_manager_kill", { pid });
}
