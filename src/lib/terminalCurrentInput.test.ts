import { describe, expect, it } from "vitest";
import {
  extractInputAfterPrompt,
  mergeTerminalDraftSources,
} from "./terminalCurrentInput";

describe("extractInputAfterPrompt", () => {
  it("strips PowerShell prompts", () => {
    expect(extractInputAfterPrompt("PS C:\\Users\\Filip\\Desktop\\oterm> hello")).toBe(
      "hello",
    );
    expect(extractInputAfterPrompt("PS D:\\Projects> ")).toBe("");
  });

  it("strips CMD prompts", () => {
    expect(extractInputAfterPrompt("C:\\Users\\Filip> dir")).toBe("dir");
    expect(extractInputAfterPrompt("C:\\Projects\\myapp> ")).toBe("");
  });

  it("strips bash-style prompts", () => {
    expect(extractInputAfterPrompt("user@host:/home/user/projects$ ls")).toBe("ls");
    expect(extractInputAfterPrompt("root@host:/var/www# apt")).toBe("apt");
  });

  it("strips unix path prompts", () => {
    expect(extractInputAfterPrompt("/home/user/projects/oterm> npm")).toBe("npm");
  });

  it("returns user-only lines unchanged", () => {
    expect(extractInputAfterPrompt("hello world")).toBe("hello world");
  });

  it("strips ANSI escape sequences", () => {
    expect(
      extractInputAfterPrompt("\x1b[32mPS C:\\dev>\x1b[0m echo test"),
    ).toBe("echo test");
  });
});

describe("mergeTerminalDraftSources", () => {
  it("prefers the longer draft when PTY echo lags by a character", () => {
    expect(mergeTerminalDraftSources("hello me to", "hello me too")).toBe(
      "hello me too",
    );
  });

  it("prefers the longer buffer when the shell completed ahead of local draft", () => {
    expect(mergeTerminalDraftSources("git checkout", "git ch")).toBe("git checkout");
  });

  it("returns the sole source when the other is empty", () => {
    expect(mergeTerminalDraftSources("", "npm test")).toBe("npm test");
    expect(mergeTerminalDraftSources("ls -la", "")).toBe("ls -la");
  });
});
