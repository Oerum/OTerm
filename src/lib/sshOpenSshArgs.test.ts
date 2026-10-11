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

  it("sanitizes environment variable keys to prevent command injection", () => {
    const endpoint = defaultSshEndpoint({
      id: "test-inj",
      label: "Test Injection",
      host: "example.com",
      username: "root",
      auth: { method: "agent" },
      environment: {
        "EVIL; calc": "value",
        "INVALID-KEY": "value",
        "$ANOTHER": "value",
        "GOOD_KEY": "good\r\nmalicious",
      },
    });
    const cmd = buildTerminalLaunchCommand(endpoint, mockLibrary);
    expect(cmd).not.toContain("EVIL; calc");
    expect(cmd).not.toContain("INVALID-KEY");
    expect(cmd).not.toContain("$ANOTHER");
    expect(cmd).toContain("GOOD_KEY=goodmalicious");
  });

  it("throws when proxy host contains shell injection characters", () => {
    const endpoint = defaultSshEndpoint({
      id: "test-inj",
      label: "Test Injection",
      host: "example.com",
      username: "root",
      auth: { method: "agent" },
      proxy: {
        type: "socks5",
        host: "evil.com; calc",
        port: 1080,
      },
    });
    expect(() => buildTerminalLaunchCommand(endpoint, mockLibrary)).toThrow(
      "Invalid characters in proxy host",
    );
  });

  it("throws when target host contains shell injection characters", () => {
    const endpoint = defaultSshEndpoint({
      id: "test-inj",
      label: "Test Injection",
      host: "example.com; calc",
      username: "root",
      auth: { method: "agent" },
    });
    expect(() => buildTerminalLaunchCommand(endpoint, mockLibrary)).toThrow(
      "Invalid characters in target host",
    );
  });

  it("throws when jump host contains shell injection characters", () => {
    const jump = defaultSshEndpoint({
      id: "jump-1",
      host: "example.com; calc",
      username: "root",
      auth: { method: "agent" },
    });
    const endpoint = defaultSshEndpoint({
      id: "test-inj",
      label: "Test Injection",
      host: "example.com",
      username: "root",
      jumpHostId: "jump-1",
      auth: { method: "agent" },
    });
    const libraryWithJump = { ...mockLibrary, endpoints: [jump] };
    expect(() => buildTerminalLaunchCommand(endpoint, libraryWithJump)).toThrow(
      "Invalid characters in jump host",
    );
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
    expect(cmd).toContain("'-t' '--' 'root@example.com' 'bash -lc ''echo hello'''");
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
    expect(cmd).toContain('"-t" "--" "root@example.com" "bash -lc \'echo hello\'"');
  });

  it("places -- before destination to prevent command-line option injection", () => {
    const endpoint = defaultSshEndpoint({
      id: "test-inj",
      label: "Option Injection",
      host: "example.com",
      username: "-oProxyCommand=calc",
      auth: { method: "agent" },
    });
    const cmd = buildTerminalLaunchCommand(endpoint, mockLibrary);
    expect(cmd).toContain("-- '-oProxyCommand=calc@example.com'");
  });

  it("places -t before -- when remote snippets exist so OpenSSH allocates a tty", () => {
    const endpoint = defaultSshEndpoint({
      id: "test-snippet",
      label: "Snippet Test",
      host: "example.com",
      username: "-oProxyCommand=calc",
      startupSnippet: "echo injected",
      auth: { method: "agent" },
    });
    const cmd = buildTerminalLaunchCommand(endpoint, mockLibrary);
    expect(cmd).toContain("-t -- '-oProxyCommand=calc@example.com' 'bash -lc");
  });

  it("formats mosh launch command with -- before destination and clean --ssh options", () => {
    const endpoint = defaultSshEndpoint({
      id: "test-mosh",
      label: "Mosh Server",
      connectionType: "mosh",
      host: "example.com",
      username: "-oProxyCommand=calc",
      port: 2222,
      auth: { method: "agent" },
    });
    const cmd = buildTerminalLaunchCommand(endpoint, mockLibrary);
    expect(cmd).toContain("mosh --ssh=");
    expect(cmd).toContain("-p 2222");
    expect(cmd).not.toContain("-p 2222 --");
    expect(cmd).toContain("-- '-oProxyCommand=calc@example.com'");
  });
});
