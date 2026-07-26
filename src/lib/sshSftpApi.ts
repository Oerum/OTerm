import { invoke } from "@tauri-apps/api/core";
import type {
  SshConnectError,
  SshConnectRequest,
  SshConnectResult,
  SshSftpEntry,
} from "../types/sshSftp";

export function parseSshConnectError(message: string): SshConnectError | null {
  try {
    const parsed = JSON.parse(message) as SshConnectError;
    if (parsed.code === "HOST_KEY_UNKNOWN" || parsed.code === "HOST_KEY_CHANGED") {
      return parsed;
    }
  } catch {
    // not a structured host-key error
  }
  return null;
}

export function unknownHostKeyConfirm(
  host: string,
  port: number,
  error: SshConnectError,
  action: "test" | "connect",
): { title: string; message: string; confirmLabel: string } {
  const footer =
    action === "test"
      ? "Trust this host and test connection?"
      : "Only continue if you trust this server.";
  return {
    title: "Trust this host?",
    message: `The server ${host}:${port} is not in your known_hosts file.\n\n${error.algorithm}\n${error.fingerprint}\n\n${footer}`,
    confirmLabel: action === "test" ? "Trust and test" : "Trust and connect",
  };
}

export function sshSftpConnect(request: SshConnectRequest): Promise<SshConnectResult> {
  return invoke<SshConnectResult>("ssh_sftp_connect", { request });
}

export function sshSftpDisconnect(sessionId: string): Promise<void> {
  return invoke("ssh_sftp_disconnect", { sessionId });
}

export function sshSftpListDir(sessionId: string, path: string): Promise<SshSftpEntry[]> {
  return invoke<SshSftpEntry[]>("ssh_sftp_list_dir", { sessionId, path });
}

export function sshSftpCreateDir(sessionId: string, path: string): Promise<void> {
  return invoke("ssh_sftp_create_dir", { sessionId, path });
}

export function sshSftpRemovePath(sessionId: string, path: string, isDir: boolean): Promise<void> {
  return invoke("ssh_sftp_remove_path", { sessionId, path, isDir });
}

export async function sshSftpDownload(
  sessionId: string,
  path: string,
  maxTransferBytes: number,
): Promise<Uint8Array> {
  const data = await invoke<number[]>("ssh_sftp_download", {
    sessionId,
    path,
    maxTransferBytes,
  });
  return Uint8Array.from(data);
}

export function sshSftpUpload(
  sessionId: string,
  path: string,
  data: Uint8Array,
  maxTransferBytes: number,
): Promise<void> {
  return invoke("ssh_sftp_upload", {
    sessionId,
    path,
    data: Array.from(data),
    maxTransferBytes,
  });
}
