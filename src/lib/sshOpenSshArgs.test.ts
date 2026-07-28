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
});
