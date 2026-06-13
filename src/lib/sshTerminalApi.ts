import { invoke } from "@tauri-apps/api/core";
import type { SshConnectRequest } from "../types/sshSftp";

export function sshTerminalSpawn(
  request: SshConnectRequest,
  cols: number,
  rows: number,
  startupSnippet?: string | null,
): Promise<string> {
  return invoke<string>("ssh_terminal_spawn", {
    request,
    cols,
    rows,
    startupSnippet: startupSnippet ?? null,
  });
}

export function sshTerminalWrite(sessionId: string, data: string): Promise<void> {
  return invoke("ssh_terminal_write", { sessionId, data });
}

export function sshTerminalResize(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke("ssh_terminal_resize", { sessionId, cols, rows });
}

export function sshTerminalKill(sessionId: string): Promise<void> {
  return invoke("ssh_terminal_kill", { sessionId });
}

export function sshTerminalKillAll(): Promise<void> {
  return invoke("ssh_terminal_kill_all");
}
