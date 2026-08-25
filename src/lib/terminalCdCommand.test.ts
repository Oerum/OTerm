import { describe, expect, it } from "vitest";
import { buildTerminalCdCommand } from "./terminalCdCommand";

describe("buildTerminalCdCommand", () => {
  describe("cmd.exe", () => {
    it("builds cd command with /d and quotes", () => {
      expect(buildTerminalCdCommand("C:\\Users\\test", "cmd")).toBe(
        'cd /d "C:\\Users\\test"',
      );
    });

    it("strips double quotes from path to prevent breakout", () => {
      expect(buildTerminalCdCommand('C:\\foo" && calc.exe && "', "cmd")).toBe(
        'cd /d "C:\\foo && calc.exe && "',
      );
    });

    it("strips newlines to prevent multi-line command injection", () => {
      expect(buildTerminalCdCommand("C:\\test\ncalc.exe\r", "cmd")).toBe(
        'cd /d "C:\\testcalc.exe"',
      );
    });
  });

  describe("PowerShell", () => {
    it("uses Set-Location -LiteralPath with single quotes for pwsh", () => {
      expect(buildTerminalCdCommand("C:\\Users\\test", "pwsh")).toBe(
        "Set-Location -LiteralPath 'C:\\Users\\test'",
      );
    });

    it("uses Set-Location -LiteralPath with single quotes for powershell", () => {
      expect(buildTerminalCdCommand("C:\\Users\\test", "powershell")).toBe(
        "Set-Location -LiteralPath 'C:\\Users\\test'",
      );
    });

    it("escapes single quotes by doubling them", () => {
      expect(buildTerminalCdCommand("C:\\Users\\it's test", "pwsh")).toBe(
        "Set-Location -LiteralPath 'C:\\Users\\it''s test'",
      );
    });

    it("strips newlines to prevent multi-line command injection", () => {
      expect(buildTerminalCdCommand("C:\\test\ncalc.exe\r", "pwsh")).toBe(
        "Set-Location -LiteralPath 'C:\\testcalc.exe'",
      );
    });
  });

  describe("POSIX and default shells", () => {
    it("uses shellQuote with cd for bash", () => {
      expect(buildTerminalCdCommand("/home/user/my folder", "bash")).toBe(
        "cd '/home/user/my folder'",
      );
    });

    it("uses shellQuote with cd when shellId is undefined", () => {
      expect(buildTerminalCdCommand("/home/user/repo")).toBe(
        "cd '/home/user/repo'",
      );
    });

    it("escapes single quotes for POSIX shells", () => {
      expect(buildTerminalCdCommand("/home/user/it's a folder", "zsh")).toBe(
        "cd '/home/user/it'\\''s a folder'",
      );
    });

    it("strips newlines to prevent multi-line command injection", () => {
      expect(buildTerminalCdCommand("/home/user\nrm -rf /\r", "bash")).toBe(
        "cd '/home/userrm -rf /'",
      );
    });
  });

  describe("empty or whitespace only cases", () => {
    it("returns empty string if input is empty or only newlines", () => {
      expect(buildTerminalCdCommand("")).toBe("");
      expect(buildTerminalCdCommand("\r\n")).toBe("");
    });
  });
});
