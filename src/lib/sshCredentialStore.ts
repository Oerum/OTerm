import { invoke } from "@tauri-apps/api/core";

/** Must match `password_key` in src-tauri/src/ssh_credentials/mod.rs */
export function hostPasswordCredentialId(endpointId: string): string {
  return `host:${endpointId}:password`;
}

/** Must match `identity_passphrase_key` in src-tauri/src/ssh_credentials/mod.rs */
export function identityPassphraseCredentialId(identityId: string): string {
  return `identity:${identityId}:passphrase`;
}

export function sshCredSet(id: string, secret: string): Promise<void> {
  return invoke<void>("ssh_cred_set", { id, secret });
}

export function sshCredGet(id: string): Promise<string | null> {
  return invoke<string | null>("ssh_cred_get", { id });
}

export function sshCredDelete(id: string): Promise<void> {
  return invoke<void>("ssh_cred_delete", { id });
}

export async function saveHostPassword(endpointId: string, password: string): Promise<void> {
  await sshCredSet(hostPasswordCredentialId(endpointId), password);
}

export async function loadHostPassword(endpointId: string): Promise<string | null> {
  try {
    return await sshCredGet(hostPasswordCredentialId(endpointId));
  } catch {
    return null;
  }
}

export async function deleteHostPassword(endpointId: string): Promise<void> {
  await sshCredDelete(hostPasswordCredentialId(endpointId));
}

export async function saveIdentityPassphrase(
  identityId: string,
  passphrase: string,
): Promise<void> {
  await sshCredSet(identityPassphraseCredentialId(identityId), passphrase);
}

export async function loadIdentityPassphrase(identityId: string): Promise<string | null> {
  try {
    return await sshCredGet(identityPassphraseCredentialId(identityId));
  } catch {
    return null;
  }
}

export async function deleteIdentityPassphrase(identityId: string): Promise<void> {
  await sshCredDelete(identityPassphraseCredentialId(identityId));
}
