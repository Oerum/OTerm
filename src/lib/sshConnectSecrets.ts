import {
  loadHostPassword,
  loadIdentityPassphrase,
} from "./sshCredentialStore";
import {
  endpointAuthMethod,
  endpointKeyPath,
  type SshConnectRequest,
  type SshEndpoint,
  type SshSftpLibrary,
} from "../types/sshSftp";

export type ConnectSecrets = {
  password?: string;
  keyPassphrase?: string;
};

export type SshSecretKind = "password" | "passphrase";

export type SshConnectPrompts = {
  askSecret: (options: {
    kind: SshSecretKind;
    endpoint: SshEndpoint;
    title: string;
    label: string;
    defaultSave: boolean;
  }) => Promise<string>;
  toast?: (message: string, kind: "info" | "success" | "error") => void;
  agentUnsupported?: (context: "sftp" | "terminal") => void;
};

export function buildSshConnectRequest(
  endpoint: SshEndpoint,
  library: SshSftpLibrary,
  secrets: ConnectSecrets,
  acceptHostKey = false,
): SshConnectRequest {
  const auth = endpointAuthMethod(endpoint);
  return {
    host: endpoint.host,
    port: endpoint.port,
    username: endpoint.username,
    authMethod: auth,
    password: secrets.password ?? null,
    keyPath: endpointKeyPath(endpoint, library.identities),
    keyPassphrase: secrets.keyPassphrase || null,
    acceptHostKey,
  };
}

function warnAuthLimitations(
  endpoint: SshEndpoint,
  library: SshSftpLibrary,
  prompts: SshConnectPrompts,
  auth: ReturnType<typeof endpointAuthMethod>,
  context: "sftp" | "terminal",
) {
  if (auth === "fido2") {
    prompts.toast?.(
      context === "sftp"
        ? "FIDO2 SFTP uses the key file path only; hardware touch may fail in integrated SFTP."
        : "FIDO2 uses the key file path; hardware touch may fail in the integrated terminal.",
      "info",
    );
  }
  if (auth === "certificate") {
    const identity = library.identities.find((item) => item.id === endpoint.auth.identityId);
    if (identity?.path.match(/\.(p12|pfx)$/i)) {
      prompts.toast?.(
        "PKCS#12 certificates are best supported via OpenSSH terminal; integrated auth may require an exported PEM key.",
        "info",
      );
    }
  }
}

async function resolvePasswordSecret(
  endpoint: SshEndpoint,
  prompts: SshConnectPrompts,
  existing?: string,
): Promise<string | undefined | null> {
  let password = existing;
  if (password !== undefined) return password;
  if (endpoint.auth.savePassword) {
    password = (await loadHostPassword(endpoint.id)) ?? undefined;
  }
  if (password !== undefined) return password;
  try {
    return await prompts.askSecret({
      kind: "password",
      endpoint,
      title: "SSH password",
      label: `Password for ${endpoint.username}@${endpoint.host}`,
      defaultSave: endpoint.auth.savePassword ?? false,
    });
  } catch {
    return null;
  }
}

async function resolvePassphraseSecret(
  endpoint: SshEndpoint,
  library: SshSftpLibrary,
  prompts: SshConnectPrompts,
  existing?: string,
): Promise<string | undefined | null> {
  let keyPassphrase = existing;
  const identity = library.identities.find((item) => item.id === endpoint.auth.identityId);
  if (keyPassphrase !== undefined || !identity?.hasPassphrase) return keyPassphrase;
  keyPassphrase = (await loadIdentityPassphrase(identity.id)) ?? undefined;
  if (keyPassphrase !== undefined) return keyPassphrase;
  try {
    return await prompts.askSecret({
      kind: "passphrase",
      endpoint,
      title: "Key passphrase",
      label: "Passphrase (leave empty if none)",
      defaultSave: false,
    });
  } catch {
    return null;
  }
}

export async function resolveConnectSecrets(
  endpoint: SshEndpoint,
  library: SshSftpLibrary,
  prompts: SshConnectPrompts,
  existing?: ConnectSecrets,
  options?: { context?: "sftp" | "terminal" },
): Promise<ConnectSecrets | null> {
  const context = options?.context ?? "sftp";
  const auth = endpointAuthMethod(endpoint);

  if (auth === "agent") {
    if (context === "sftp") prompts.agentUnsupported?.("sftp");
    return null;
  }

  warnAuthLimitations(endpoint, library, prompts, auth, context);

  let password = existing?.password;
  let keyPassphrase = existing?.keyPassphrase;
  const keyPath = endpointKeyPath(endpoint, library.identities);

  if (auth === "password") {
    const resolved = await resolvePasswordSecret(endpoint, prompts, password);
    if (resolved === null) return null;
    password = resolved;
  } else if (keyPath) {
    const resolved = await resolvePassphraseSecret(endpoint, library, prompts, keyPassphrase);
    if (resolved === null) return null;
    keyPassphrase = resolved;
  }

  return { password, keyPassphrase };
}

export function endpointHasNetworkHop(endpoint: SshEndpoint): boolean {
  if (endpoint.jumpHostId) return true;
  return endpoint.proxy.type !== "none" && endpoint.proxy.host.trim().length > 0;
}

/** Integrated russh connect (direct TCP), as opposed to external OpenSSH launch. */
function usesIntegratedRussh(
  endpoint: SshEndpoint,
  context: "sftp" | "terminal",
): boolean {
  if (context === "sftp") return true;
  return usesNativeSshTerminal(endpoint);
}

export function networkHopIntegratedConnectError(
  endpoint: SshEndpoint,
  context: "sftp" | "terminal",
): string | null {
  if (!endpointHasNetworkHop(endpoint) || !usesIntegratedRussh(endpoint, context)) {
    return null;
  }
  if (context === "sftp") {
    return "Integrated SFTP connects directly and does not support jump hosts or proxies. Clear those settings on the SSH tab.";
  }
  return "Integrated SSH does not support jump hosts or proxies. Use SSH agent auth for the external OpenSSH terminal, or clear jump/proxy settings.";
}

export function usesNativeSshTerminal(endpoint: SshEndpoint): boolean {
  const auth = endpointAuthMethod(endpoint);
  return endpoint.connectionType === "ssh" && auth !== "agent";
}
