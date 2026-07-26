import { describe, expect, it } from "vitest";
import { unknownHostKeyConfirm } from "./sshSftpApi";

describe("unknownHostKeyConfirm", () => {
  const error = {
    code: "HOST_KEY_UNKNOWN" as const,
    algorithm: "ssh-ed25519",
    fingerprint: "SHA256:abc",
  };

  it("builds trust-and-test copy", () => {
    const confirm = unknownHostKeyConfirm("example.com", 22, error, "test");
    expect(confirm.title).toBe("Trust this host?");
    expect(confirm.confirmLabel).toBe("Trust and test");
    expect(confirm.message).toContain("example.com:22");
    expect(confirm.message).toContain("ssh-ed25519");
    expect(confirm.message).toContain("SHA256:abc");
    expect(confirm.message).toContain("Trust this host and test connection?");
  });

  it("builds trust-and-connect copy", () => {
    const confirm = unknownHostKeyConfirm("host", 2222, error, "connect");
    expect(confirm.confirmLabel).toBe("Trust and connect");
    expect(confirm.message).toContain("host:2222");
    expect(confirm.message).toContain("Only continue if you trust this server.");
  });
});
