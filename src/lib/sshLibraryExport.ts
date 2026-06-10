import type { SshSftpLibrary } from "../types/sshSftp";
import { parseSshSftpLibrary } from "./sshSftpStore";

export type SshLibraryExport = Omit<SshSftpLibrary, "endpoints"> & {
  endpoints: Array<
    Omit<SshSftpLibrary["endpoints"][number], "auth"> & {
      auth: {
        method: SshSftpLibrary["endpoints"][number]["auth"]["method"];
        identityId?: string | null;
        savePassword?: boolean;
      };
    }
  >;
};

export function exportSshLibrary(library: SshSftpLibrary): SshLibraryExport {
  return {
    schemaVersion: library.schemaVersion,
    groups: library.groups,
    endpoints: library.endpoints.map((endpoint) => ({
      ...endpoint,
      auth: {
        method: endpoint.auth.method,
        identityId: endpoint.auth.identityId ?? null,
        savePassword: endpoint.auth.savePassword ?? false,
      },
    })),
    identities: library.identities.map(({ id, label, kind, path, hasPassphrase }) => ({
      id,
      label,
      kind,
      path,
      hasPassphrase,
    })),
  };
}

export function importSshLibrary(raw: unknown): SshSftpLibrary {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid SSH library export");
  }
  return parseSshSftpLibrary(parsed as Record<string, unknown>);
}
