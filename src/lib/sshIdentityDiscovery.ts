import { listDirectory, userHome } from "./fsApi";
import { joinPath } from "./fsTransferApi";
import { newId } from "./sshSftpStore";
import type { SshIdentity } from "../types/sshIdentity";

const DISCOVERED_NAMES = ["id_ed25519", "id_rsa", "id_ecdsa", "id_dsa"] as const;

function identityKindForName(name: string): SshIdentity["kind"] {
  return name.startsWith("id_") ? "privateKey" : "privateKey";
}

export async function discoverSshIdentities(): Promise<SshIdentity[]> {
  let sshDir: string;
  try {
    const home = await userHome();
    sshDir = joinPath(home, ".ssh");
    const entries = await listDirectory(sshDir);
    const discovered: SshIdentity[] = [];
    for (const entry of entries) {
      if (entry.isDir || entry.name.endsWith(".pub")) continue;
      if (!DISCOVERED_NAMES.includes(entry.name as (typeof DISCOVERED_NAMES)[number])) {
        continue;
      }
      discovered.push({
        id: newId("identity"),
        label: entry.name,
        kind: identityKindForName(entry.name),
        path: entry.path,
        hasPassphrase: false,
      });
    }
    return discovered;
  } catch {
    return [];
  }
}

export function mergeDiscoveredIdentities(
  existing: SshIdentity[],
  discovered: SshIdentity[],
): SshIdentity[] {
  const paths = new Set(existing.map((item) => item.path));
  const merged = [...existing];
  for (const identity of discovered) {
    if (paths.has(identity.path)) continue;
    merged.push(identity);
    paths.add(identity.path);
  }
  return merged;
}

export function identityKindForAuth(
  method: import("../types/sshSftp").SshAuthMethod,
): SshIdentity["kind"] | null {
  if (method === "publicKey") return "privateKey";
  if (method === "certificate") return "certificate";
  if (method === "fido2") return "fido2";
  return null;
}
