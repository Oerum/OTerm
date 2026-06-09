import { describe, expect, it } from "vitest";
import {
  appendPromptScanBuffer,
  detectShellPrompt,
  detectTrailingShellPrompt,
  looksLikeTuiTransition,
} from "./terminalPrompt";

describe("detectShellPrompt", () => {
  it("detects PowerShell prompts", () => {
    expect(detectShellPrompt("PS C:\\Users\\Filip\\Desktop\\oterm> ")).toEqual({
      cwd: "C:\\Users\\Filip\\Desktop\\oterm",
    });
    expect(detectShellPrompt("\r\nPS D:\\Projects>")).toEqual({
      cwd: "D:\\Projects",
    });
  });

  it("detects Windows CMD prompts", () => {
    expect(detectShellPrompt("C:\\Users\\Filip>")).toEqual({
      cwd: "C:\\Users\\Filip",
    });
    expect(detectShellPrompt("C:\\Projects\\myapp> ")).toEqual({
      cwd: "C:\\Projects\\myapp",
    });
    expect(detectShellPrompt("\x1b]133;AC:\\Projects\\myapp>")).toEqual({
      cwd: "C:\\Projects\\myapp",
    });
  });

  it("detects Unix-style path prompts", () => {
    expect(detectShellPrompt("/home/user/projects/oterm> ")).toEqual({
      cwd: "/home/user/projects/oterm",
    });
    expect(detectShellPrompt("\n/var/www>")).toEqual({
      cwd: "/var/www",
    });
  });

  it("detects bash-style prompts with $ or #", () => {
    expect(detectShellPrompt("user@host:/home/user/projects$ ")).toEqual({
      cwd: "/home/user/projects",
    });
    expect(detectShellPrompt("root@host:/var/www#")).toEqual({
      cwd: "/var/www",
    });
  });

  it("does not false-positive on typical agent TUI output", () => {
    expect(detectShellPrompt("Welcome to Claude Code")).toBeNull();
    expect(detectShellPrompt("> /help")).toBeNull();
    expect(detectShellPrompt("Press Ctrl+D again to exit")).toBeNull();
    expect(detectShellPrompt("⠋ Thinking...")).toBeNull();
  });

  it("does not match prompt-like paths embedded in log output", () => {
    expect(detectShellPrompt("See /var/www> for details")).toBeNull();
    expect(detectShellPrompt("user@host:/home/user/projects$ still running")).toBeNull();
  });
});

describe("detectTrailingShellPrompt", () => {
  it("matches a trailing PowerShell prompt", () => {
    expect(detectTrailingShellPrompt("PS C:\\Users\\Filip\\Desktop\\oterm> ")).toEqual({
      cwd: "C:\\Users\\Filip\\Desktop\\oterm",
    });
  });

  it("matches a trailing CMD prompt", () => {
    expect(detectTrailingShellPrompt("C:\\Projects\\myapp>")).toEqual({
      cwd: "C:\\Projects\\myapp",
    });
  });

  it("does not match when the prompt is not on the last line", () => {
    expect(
      detectTrailingShellPrompt(
        "Welcome to Agy\r\nPS C:\\Users\\Filip\\Desktop\\oterm> \r\nAntigravity ready",
      ),
    ).toBeNull();
  });
});

describe("appendPromptScanBuffer", () => {
  it("detects a PowerShell prompt split across PTY chunks", () => {
    const first = appendPromptScanBuffer("", "PS C:\\Users");
    expect(first.trailingPrompt).toBeNull();

    const second = appendPromptScanBuffer(first.buffer, "\\Filip\\Desktop\\oterm> ");
    expect(second.trailingPrompt).toEqual({
      cwd: "C:\\Users\\Filip\\Desktop\\oterm",
    });
  });

  it("caps buffer size", () => {
    const filler = "x".repeat(9000);
    const result = appendPromptScanBuffer("", filler);
    expect(result.buffer.length).toBeLessThanOrEqual(8192);
  });
});

describe("looksLikeTuiTransition", () => {
  it("detects clear-screen and alternate-buffer sequences", () => {
    expect(looksLikeTuiTransition("\x1b[2J\x1b[H")).toBe(true);
    expect(looksLikeTuiTransition("\x1b[?1049h")).toBe(true);
    expect(looksLikeTuiTransition("\x1b[?1049l")).toBe(true);
    expect(looksLikeTuiTransition("PS C:\\dev> ")).toBe(false);
  });
});
