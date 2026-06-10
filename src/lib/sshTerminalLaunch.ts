import type { SshConnectError, SshConnectRequest } from "../types/sshSftp";

export type PendingSshTerminalLaunch = {
  request: SshConnectRequest;
  startupSnippet: string | null;
  trustHostKey: (error: SshConnectError) => Promise<boolean>;
};

const pendingLaunches = new Map<string, PendingSshTerminalLaunch>();

export function setPendingSshTerminalLaunch(
  paneId: string,
  launch: PendingSshTerminalLaunch,
): void {
  pendingLaunches.set(paneId, launch);
}

export function peekPendingSshTerminalLaunch(
  paneId: string,
): PendingSshTerminalLaunch | undefined {
  return pendingLaunches.get(paneId);
}

export function clearPendingSshTerminalLaunch(paneId: string): void {
  pendingLaunches.delete(paneId);
}
