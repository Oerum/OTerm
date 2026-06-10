export type SshAuthMethod =
  | "password"
  | "publicKey"
  | "certificate"
  | "agent"
  | "fido2";

export type SshBackspaceMode = "default" | "ctrl-h" | "del";

export type SshConnectionType = "ssh" | "mosh";

export type SshEncoding = "utf-8" | "latin1" | "ascii";

export interface SshHostAuth {
  method: SshAuthMethod;
  identityId?: string | null;
  savePassword?: boolean;
  /** @deprecated migrated from v1 keyPath when no identity */
  keyPath?: string | null;
}

export interface SshHostProxy {
  type: "none" | "socks5" | "http";
  host: string;
  port: number;
  username?: string;
}

export interface SshGroup {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
}

/** @deprecated use SshGroup */
export type SshCategory = SshGroup;

export interface SshEndpoint {
  id: string;
  schemaVersion: number;
  groupId: string | null;
  /** @deprecated use groupId */
  categoryId?: string | null;
  label: string;
  /** @deprecated use label */
  name?: string;
  host: string;
  port: number;
  username: string;
  auth: SshHostAuth;
  /** @deprecated use auth.method */
  authMethod?: SshAuthMethod;
  /** @deprecated use auth.identityId / auth.keyPath */
  keyPath?: string | null;
  tags: string[];
  defaultPath: string;
  localStartPath: string;
  notes: string;
  connectionType: SshConnectionType;
  agentForwarding: boolean;
  jumpHostId: string | null;
  proxy: SshHostProxy;
  environment: Record<string, string>;
  encoding: SshEncoding;
  backspace: SshBackspaceMode;
  startupSnippet: string;
  themeId: string | null;
}

export interface SshSftpLibrary {
  schemaVersion: number;
  groups: SshGroup[];
  /** @deprecated use groups */
  categories?: SshGroup[];
  endpoints: SshEndpoint[];
  identities: import("./sshIdentity").SshIdentity[];
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

export const SSH_LIBRARY_SCHEMA_VERSION = 2;

export const DEFAULT_SSH_PROXY: SshHostProxy = {
  type: "none",
  host: "",
  port: 1080,
};

export function defaultSshEndpoint(partial?: Partial<SshEndpoint>): SshEndpoint {
  return {
    id: partial?.id ?? "",
    schemaVersion: SSH_LIBRARY_SCHEMA_VERSION,
    groupId: partial?.groupId ?? null,
    label: partial?.label ?? "",
    host: partial?.host ?? "",
    port: partial?.port ?? 22,
    username: partial?.username ?? "",
    auth: partial?.auth ?? { method: "password", savePassword: false },
    tags: partial?.tags ?? [],
    defaultPath: partial?.defaultPath ?? ".",
    localStartPath: partial?.localStartPath ?? "",
    notes: partial?.notes ?? "",
    connectionType: partial?.connectionType ?? "ssh",
    agentForwarding: partial?.agentForwarding ?? false,
    jumpHostId: partial?.jumpHostId ?? null,
    proxy: partial?.proxy ?? { ...DEFAULT_SSH_PROXY },
    environment: partial?.environment ?? {},
    encoding: partial?.encoding ?? "utf-8",
    backspace: partial?.backspace ?? "default",
    startupSnippet: partial?.startupSnippet ?? "",
    themeId: partial?.themeId ?? null,
  };
}

export function endpointAuthMethod(endpoint: SshEndpoint): SshAuthMethod {
  return endpoint.auth?.method ?? endpoint.authMethod ?? "password";
}

export function endpointKeyPath(
  endpoint: SshEndpoint,
  identities: import("./sshIdentity").SshIdentity[],
): string | null {
  const identityId = endpoint.auth?.identityId;
  if (identityId) {
    const identity = identities.find((item) => item.id === identityId);
    return identity?.path ?? null;
  }
  return endpoint.auth?.keyPath ?? endpoint.keyPath ?? null;
}

export function endpointDisplayLabel(endpoint: SshEndpoint): string {
  return endpoint.label || endpoint.name || endpoint.host || "Untitled";
}
