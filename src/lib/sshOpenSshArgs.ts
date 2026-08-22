import {
  endpointAuthMethod,
  endpointDisplayLabel,
  endpointKeyPath,
  type SshEndpoint,
  type SshSftpLibrary,
} from "../types/sshSftp";
import { shellQuote } from "./shellQuote";

function resolveJumpHost(endpoint: SshEndpoint, library: SshSftpLibrary): string | null {
  if (!endpoint.jumpHostId) return null;
  const jump = library.endpoints.find((item) => item.id === endpoint.jumpHostId);
  if (!jump) return null;
  const port = jump.port === 22 ? "" : `:${jump.port}`;
  return `${jump.username}@${jump.host}${port}`;
}

function backspaceSnippet(mode: SshEndpoint["backspace"]): string | null {
  if (mode === "ctrl-h") return "stty erase ^H";
  if (mode === "del") return "stty erase ^?";
  return null;
}

function encodingEnv(encoding: SshEndpoint["encoding"]): Record<string, string> {
  if (encoding === "latin1") return { LANG: "C", LC_ALL: "C" };
  if (encoding === "ascii") return { LANG: "C", LC_CTYPE: "C" };
  return { LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" };
}

function buildOpenSshArgs(endpoint: SshEndpoint, library: SshSftpLibrary): string[] {
  const args: string[] = [];
  if (endpoint.port !== 22) args.push("-p", String(endpoint.port));
  if (endpoint.agentForwarding) args.push("-A");

  const jump = resolveJumpHost(endpoint, library);
  if (jump) args.push("-J", jump);

  if (endpoint.proxy.type !== "none" && endpoint.proxy.host.trim()) {
    const proxyHost = endpoint.proxy.host.trim();
    const proxyPort = endpoint.proxy.port || (endpoint.proxy.type === "http" ? 8080 : 1080);
    if (endpoint.proxy.type === "socks5") {
      args.push("-o", `ProxyCommand=connect -S ${proxyHost}:${proxyPort} %h %p`);
    } else {
      args.push("-o", `ProxyCommand=nc -X connect -x ${proxyHost}:${proxyPort} %h %p`);
    }
  }

  const env = { ...encodingEnv(endpoint.encoding), ...endpoint.environment };
  for (const key of Object.keys(env)) {
    args.push("-o", `SendEnv=${key}`);
  }

  const auth = endpointAuthMethod(endpoint);
  const keyPath = endpointKeyPath(endpoint, library.identities);
  if (auth !== "password" && auth !== "agent" && keyPath?.trim()) {
    args.push("-i", keyPath.trim());
  }
  if (auth === "fido2" && keyPath?.trim()) {
    args.push("-o", "IdentitiesOnly=yes");
  }

  args.push(`${endpoint.username}@${endpoint.host}`);
  return args;
}

function powershellQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildEnvPrefix(
  env: Record<string, string>,
  shellId?: string,
): string {
  const usePowerShell = shellId === "pwsh" || shellId === "powershell";
  if (usePowerShell) {
    const parts = Object.entries(env).map(
      ([key, value]) => `$env:${key}=${powershellQuote(value)}`,
    );
    return parts.length ? `${parts.join("; ")}; ` : "";
  }
  const parts = Object.entries(env).map(
    ([key, value]) => `${key}=${shellQuote(value)}`,
  );
  return parts.length ? `${parts.join(" ")} ` : "";
}

function buildOpenSshCommand(
  endpoint: SshEndpoint,
  library: SshSftpLibrary,
  shellId?: string,
): string {
  const args = buildOpenSshArgs(endpoint, library);
  const env = { ...encodingEnv(endpoint.encoding), ...endpoint.environment };
  const envPrefix = buildEnvPrefix(env, shellId);

  const snippets = [
    backspaceSnippet(endpoint.backspace),
    endpoint.startupSnippet.trim() || null,
  ].filter(Boolean);

  let command = `${envPrefix}ssh ${args.map(shellQuote).join(" ")}`;

  if (snippets.length) {
    const remoteCommand = snippets.join("; ");
    command = `${command} -t ${shellQuote(`bash -lc ${shellQuote(remoteCommand)}`)}`;
  }

  return command;
}

function buildMoshCommand(
  endpoint: SshEndpoint,
  library: SshSftpLibrary,
  shellId?: string,
): string {
  const sshArgs = buildOpenSshArgs(endpoint, library);
  const env = { ...encodingEnv(endpoint.encoding), ...endpoint.environment };
  const envPrefix = buildEnvPrefix(env, shellId);
  const sshCommand = `${envPrefix}ssh ${sshArgs.map(shellQuote).join(" ")}`;
  const target = `${endpoint.username}@${endpoint.host}`;
  return `mosh ${shellQuote(target)} --ssh=${shellQuote(sshCommand)}`;
}

export function buildTerminalLaunchCommand(
  endpoint: SshEndpoint,
  library: SshSftpLibrary,
  shellId?: string,
): string {
  if (endpoint.connectionType === "mosh") {
    return buildMoshCommand(endpoint, library, shellId);
  }
  return buildOpenSshCommand(endpoint, library, shellId);
}

export function terminalTabTitle(endpoint: SshEndpoint): string {
  return `ssh: ${endpointDisplayLabel(endpoint)}`;
}
