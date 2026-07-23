import { getSetting, setSetting } from "./settingsStore";
import type { SshIdentity } from "../types/sshIdentity";
import {
  defaultSshEndpoint,
  endpointDisplayLabel,
  SSH_LIBRARY_SCHEMA_VERSION,
  type SshAuthMethod,
  type SshEndpoint,
  type SshGroup,
  type SshSftpLibrary,
} from "../types/sshSftp";

const STORAGE_KEY = "oterm:ssh-sftp-library";

const emptyLibrary = (): SshSftpLibrary => ({
  schemaVersion: SSH_LIBRARY_SCHEMA_VERSION,
  groups: [],
  endpoints: [],
  identities: [],
});

function migrateGroup(raw: Partial<SshGroup>): SshGroup {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? "Group"),
    parentId: raw.parentId ?? null,
    order: typeof raw.order === "number" ? raw.order : 0,
  };
}

function migrateEndpoint(raw: Record<string, unknown>, identities: SshIdentity[]): SshEndpoint {
  const authMethod = (raw.authMethod as SshAuthMethod | undefined) ?? "password";
  const legacyKeyPath =
    typeof raw.keyPath === "string" && raw.keyPath.trim() ? raw.keyPath.trim() : null;

  let identityId: string | null = null;
  if (legacyKeyPath && authMethod !== "password") {
    const existing = identities.find((item) => item.path === legacyKeyPath);
    if (existing) {
      identityId = existing.id;
    } else {
      const id = `identity-migrated-${String(raw.id ?? Date.now())}`;
      identities.push({
        id,
        label: legacyKeyPath.split(/[/\\]/).pop() ?? "Key",
        kind: authMethod === "fido2" ? "fido2" : authMethod === "certificate" ? "certificate" : "privateKey",
        path: legacyKeyPath,
        hasPassphrase: false,
      });
      identityId = id;
    }
  }

  const authRaw = raw.auth as SshEndpoint["auth"] | undefined;
  const auth: SshEndpoint["auth"] = authRaw
    ? {
        method: authRaw.method ?? authMethod,
        identityId: authRaw.identityId ?? identityId,
        savePassword: Boolean(authRaw.savePassword),
        keyPath: authRaw.keyPath ?? legacyKeyPath,
      }
    : {
        method: authMethod,
        identityId,
        savePassword: false,
        keyPath: legacyKeyPath,
      };
  const endpoint = defaultSshEndpoint({
    id: String(raw.id ?? ""),
    schemaVersion: SSH_LIBRARY_SCHEMA_VERSION,
    groupId:
      (raw.groupId as string | null | undefined) ??
      (raw.categoryId as string | null | undefined) ??
      null,
    label: String(raw.label ?? raw.name ?? ""),
    host: String(raw.host ?? ""),
    port: typeof raw.port === "number" ? raw.port : 22,
    username: String(raw.username ?? ""),
    auth,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    defaultPath: String(raw.defaultPath ?? "."),
    localStartPath: String(raw.localStartPath ?? ""),
    notes: String(raw.notes ?? ""),
    connectionType: raw.connectionType === "mosh" ? "mosh" : "ssh",
    agentForwarding: Boolean(raw.agentForwarding),
    jumpHostId: (raw.jumpHostId as string | null | undefined) ?? null,
    proxy:
      raw.proxy && typeof raw.proxy === "object"
        ? {
            type:
              (raw.proxy as SshEndpoint["proxy"]).type === "socks5" ||
              (raw.proxy as SshEndpoint["proxy"]).type === "http"
                ? (raw.proxy as SshEndpoint["proxy"]).type
                : "none",
            host: String((raw.proxy as SshEndpoint["proxy"]).host ?? ""),
            port: Number((raw.proxy as SshEndpoint["proxy"]).port ?? 1080),
            username: (raw.proxy as SshEndpoint["proxy"]).username,
          }
        : defaultSshEndpoint().proxy,
    environment:
      raw.environment && typeof raw.environment === "object"
        ? (raw.environment as Record<string, string>)
        : {},
    encoding:
      raw.encoding === "latin1" || raw.encoding === "ascii" ? raw.encoding : "utf-8",
    backspace:
      raw.backspace === "ctrl-h" || raw.backspace === "del" ? raw.backspace : "default",
    startupSnippet: String(raw.startupSnippet ?? ""),
    themeId: (raw.themeId as string | null | undefined) ?? null,
  });

  if (authRaw?.identityId) {
    endpoint.auth.identityId = authRaw.identityId;
  } else if (identityId) {
    endpoint.auth.identityId = identityId;
  }

  return endpoint;
}

function migrateLibrary(parsed: Record<string, unknown>): SshSftpLibrary {
  const identities: SshIdentity[] = Array.isArray(parsed.identities)
    ? parsed.identities.map((item) => {
        const raw = item as Partial<SshIdentity>;
        return {
          id: String(raw.id ?? ""),
          label: String(raw.label ?? "Identity"),
          kind:
            raw.kind === "certificate" || raw.kind === "fido2" ? raw.kind : "privateKey",
          path: String(raw.path ?? ""),
          hasPassphrase: Boolean(raw.hasPassphrase),
        };
      })
    : [];

  const sourceGroups = Array.isArray(parsed.groups)
    ? parsed.groups
    : Array.isArray(parsed.categories)
      ? parsed.categories
      : [];

  const groups = sourceGroups.map((item) => migrateGroup(item as Partial<SshGroup>));

  const endpoints = Array.isArray(parsed.endpoints)
    ? parsed.endpoints.map((item) => migrateEndpoint(item as Record<string, unknown>, identities))
    : [];

  return {
    schemaVersion: SSH_LIBRARY_SCHEMA_VERSION,
    groups,
    endpoints,
    identities,
  };
}

export function parseSshSftpLibrary(parsed: Record<string, unknown>): SshSftpLibrary {
  return migrateLibrary(parsed);
}

export function loadSshSftpLibrary(): SshSftpLibrary {
  const raw = getSetting(STORAGE_KEY);
  if (!raw) return emptyLibrary();
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return migrateLibrary(parsed);
  } catch {
    return emptyLibrary();
  }
}

export function saveSshSftpLibrary(library: SshSftpLibrary): void {
  const payload: SshSftpLibrary = {
    schemaVersion: SSH_LIBRARY_SCHEMA_VERSION,
    groups: library.groups,
    endpoints: library.endpoints.map((endpoint) => ({
      ...endpoint,
      schemaVersion: SSH_LIBRARY_SCHEMA_VERSION,
    })),
    identities: library.identities,
  };
  void setSetting(STORAGE_KEY, JSON.stringify(payload));
}

/** Plain clone safe for Vue reactive proxies (structuredClone cannot clone them). */
export function cloneSshEndpoint(endpoint: SshEndpoint): SshEndpoint {
  return JSON.parse(JSON.stringify(endpoint)) as SshEndpoint;
}

let nextId = 1;
export function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${nextId++}`;
}

export function sortSshGroups(groups: SshGroup[]) {
  return [...groups].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function endpointsInGroup(endpoints: SshEndpoint[], groupId: string | null) {
  return endpoints
    .filter((e) => e.groupId === groupId)
    .sort((a, b) => endpointDisplayLabel(a).localeCompare(endpointDisplayLabel(b)));
}

export function collectAllTags(library: SshSftpLibrary): string[] {
  const tags = new Set<string>();
  for (const endpoint of library.endpoints) {
    for (const tag of endpoint.tags) {
      const trimmed = tag.trim();
      if (trimmed) tags.add(trimmed);
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function childGroups(groups: SshGroup[], parentId: string | null): SshGroup[] {
  return sortSshGroups(groups.filter((group) => group.parentId === parentId));
}
