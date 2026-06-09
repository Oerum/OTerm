import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ShellProfile, TerminalAgentChangedEvent } from "../types/terminal";

export function listShells(): Promise<ShellProfile[]> {
  return invoke<ShellProfile[]>("terminal_list_shells");
}

export function getDefaultShellId(): Promise<string> {
  return invoke<string>("terminal_default_shell_id");
}

export function spawnTerminal(
  shellId: string,
  cols: number,
  rows: number,
  cwd?: string,
): Promise<string> {
  return invoke<string>("terminal_spawn", { shellId, cols, rows, cwd: cwd ?? null });
}

export function writeTerminal(sessionId: string, data: string): Promise<void> {
  return invoke("terminal_write", { sessionId, data });
}

export function resizeTerminal(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke("terminal_resize", { sessionId, cols, rows });
}

export function killTerminal(sessionId: string): Promise<void> {
  return invoke("terminal_kill", { sessionId });
}

export function listenTerminalAgentChanged(
  handler: (event: TerminalAgentChangedEvent) => void,
): Promise<UnlistenFn> {
  return listen<TerminalAgentChangedEvent>("terminal-agent-changed", (event) => {
    handler(event.payload);
  });
}
