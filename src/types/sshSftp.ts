export type SshAuthMethod = "password" | "publicKey";

export interface SshCategory {
  id: string;
  name: string;
  order: number;
}

export interface SshEndpoint {
  id: string;
  categoryId: string | null;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: SshAuthMethod;
  keyPath: string | null;
  defaultPath: string;
  notes: string;
}

export interface SshSftpLibrary {
  categories: SshCategory[];
  endpoints: SshEndpoint[];
}

export interface SshConnectRequest {
  host: string;
  port: number;
  username: string;
  authMethod: SshAuthMethod;
  password?: string | null;
  keyPath?: string | null;
  keyPassphrase?: string | null;
  acceptHostKey?: boolean;
}

export interface SshConnectError {
  code: "HOST_KEY_UNKNOWN" | "HOST_KEY_CHANGED";
  fingerprint: string;
  algorithm: string;
  message?: string | null;
}

export interface SshSftpEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified?: string | null;
}

export interface SshConnectResult {
  sessionId: string;
  homePath: string;
}
