import { describe, expect, it } from "vitest";
import { buildTerminalLaunchCommand } from "./sshOpenSshArgs";
import { defaultSshEndpoint, type SshSftpLibrary } from "../types/sshSftp";

const mockLibrary: SshSftpLibrary = {
  schemaVersion: 2,
  groups: [],
  endpoints: [],
  identities: [],
};

describe("buildTerminalLaunchCommand", () => {
  it("quotes environment variables with special shell characters safely", () => {
    const endpoint = defaultSshEndpoint({
      id: "test-1",
      label: "Test Server",
      host: "example.com",
      username: "root",
      auth: { method: "agent" },
      environment: {
        MALICIOUS: "foo; rm -rf /",
        SAFE: "simple_val",
      },
    });
    const cmd = buildTerminalLaunchCommand(endpoint, mockLibrary);
    expect(cmd).toContain("MALICIOUS='foo; rm -rf /'");
    expect(cmd).toContain("SAFE=simple_val");
  });

  it("handles single quotes inside environment values correctly", () => {
    const endpoint = defaultSshEndpoint({
      id: "test-1",
      label: "Test Server",
      host: "example.com",
      username: "root",
      auth: { method: "agent" },
      environment: {
        QUOTE: "it's working",
      },
    });
    const cmd = buildTerminalLaunchCommand(endpoint, mockLibrary);
    expect(cmd).toContain("QUOTE='it'\\''s working'");
  });

  it("sanitizes environment variable keys and proxy hosts to prevent command injection", () => {
    const endpoint = defaultSshEndpoint({
      id: "test-inj",
      label: "Test Injection",
      host: "example.com",
      username: "root",
      auth: { method: "agent" },
      environment: {
        "EVIL; calc": "value",
        "GOOD_KEY": "good",
      },
      proxy: {
        type: "socks5",
        host: "evil.com; calc",
        port: 1080,
      }
    });
    const cmd = buildTerminalLaunchCommand(endpoint, mockLibrary);
    expect(cmd).not.toContain("EVIL; calc");
    expect(cmd).toContain("GOOD_KEY=good");
    expect(cmd).toContain("ProxyCommand=connect -S evil.comcalc:1080 %h %p");
  });

  it("formats environment variables and quotes arguments for PowerShell", () => {
    const endpoint = defaultSshEndpoint({
      id: "test-pwsh",
      label: "PWSH Server",
      host: "example.com",
      username: "root",
      port: 2222,
      auth: { method: "agent" },
      environment: {
        VAR_ONE: "val'1",
      },
      startupSnippet: "echo hello",
    });
    const cmd = buildTerminalLaunchCommand(endpoint, mockLibrary, "pwsh");
    expect(cmd).toContain("$env:VAR_ONE='val''1'; ");
    expect(cmd).toContain("ssh '-p' '2222'");
    expect(cmd).toContain("-t 'bash -lc ''echo hello'''");
  });

  it("quotes arguments and formats environment variables for cmd.exe", () => {
    const endpoint = defaultSshEndpoint({
      id: "test-cmd",
      label: "CMD Server",
      host: "example.com",
      username: "root",
      port: 2222,
      auth: { method: "agent" },
      environment: {
        VAR_CMD: 'test"value',
      },
      startupSnippet: "echo hello",
    });
    const cmd = buildTerminalLaunchCommand(endpoint, mockLibrary, "cmd");
    expect(cmd).toContain('set "VAR_CMD=testvalue" && ');
    expect(cmd).toContain('ssh "-p" "2222"');
    expect(cmd).toContain('-t "bash -lc \'echo hello\'"');
  });
});
