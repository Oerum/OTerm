import { describe, expect, it } from "vitest";
import {
  appendPromptScanBuffer,
  detectShellPrompt,
  detectTrailingShellPrompt,
  isPlausiblePromptCwd,
  looksLikeTuiTransition,
} from "./terminalPrompt";

describe("detectShellPrompt", () => {
  it("detects PowerShell prompts", () => {
    expect(detectShellPrompt("PS C:\\Users\\Oerum\\Desktop\\oterm> ")).toEqual({
      cwd: "C:\\Users\\Oerum\\Desktop\\oterm",
    });
    expect(detectShellPrompt("\r\nPS D:\\Projects>")).toEqual({
      cwd: "D:\\Projects",
    });
  });

  it("detects Windows CMD prompts", () => {
    expect(detectShellPrompt("C:\\Users\\Oerum>")).toEqual({
      cwd: "C:\\Users\\Oerum",
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

  it("does not false-positive on HTML closing tags in agent output", () => {
    expect(detectShellPrompt("</div>")).toBeNull();
    expect(detectShellPrompt("</span>")).toBeNull();
    expect(detectShellPrompt("line of agent text </div>")).toBeNull();
  });
});

describe("isPlausiblePromptCwd", () => {
  it("accepts Windows and multi-segment Unix paths", () => {
    expect(isPlausiblePromptCwd("C:\\Users\\Filip\\Desktop\\oterm")).toBe(true);
    expect(isPlausiblePromptCwd("/home/user/projects")).toBe(true);
    expect(isPlausiblePromptCwd("/var/www")).toBe(true);
  });

  it("rejects markup-like single-segment Unix paths", () => {
    expect(isPlausiblePromptCwd("/div")).toBe(false);
    expect(isPlausiblePromptCwd("/span")).toBe(false);
    expect(isPlausiblePromptCwd("/p")).toBe(false);
  });
});

describe("detectTrailingShellPrompt", () => {
  it("matches a trailing PowerShell prompt", () => {
    expect(detectTrailingShellPrompt("PS C:\\Users\\Oerum\\Desktop\\oterm> ")).toEqual({
      cwd: "C:\\Users\\Oerum\\Desktop\\oterm",
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
        "Welcome to Agy\r\nPS C:\\Users\\Oerum\\Desktop\\oterm> \r\nAntigravity ready",
      ),
    ).toBeNull();
  });

  it("does not match HTML closing tags on the last line", () => {
    expect(detectTrailingShellPrompt("streaming agent output </div>")).toBeNull();
  });
});

describe("appendPromptScanBuffer", () => {
  it("detects a PowerShell prompt split across PTY chunks", () => {
    const first = appendPromptScanBuffer("", "PS C:\\Users");
    expect(first.trailingPrompt).toBeNull();

    const second = appendPromptScanBuffer(first.buffer, "\\Oerum\\Desktop\\oterm> ");
    expect(second.trailingPrompt).toEqual({
      cwd: "C:\\Users\\Oerum\\Desktop\\oterm",
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
