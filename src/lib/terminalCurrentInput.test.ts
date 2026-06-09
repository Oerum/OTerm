import type { Terminal } from "@xterm/xterm";
import { describe, expect, it } from "vitest";
import {
  extractInputAfterPrompt,
  mergeTerminalDraftSources,
  readTerminalCurrentInput,
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

  it("does not truncate commands containing delimiters", () => {
    expect(extractInputAfterPrompt("PS C:\\dev> echo $VAR")).toBe("echo $VAR");
    expect(extractInputAfterPrompt('user@host:~$ git commit -m "fixes #12"')).toBe(
      'git commit -m "fixes #12"',
    );
    expect(extractInputAfterPrompt('C:\\Users\\Filip> echo "hello > world"')).toBe(
      'echo "hello > world"',
    );
  });
});

function makeMockTerminal(
  lines: { text: string; wrapped?: boolean }[],
  cursorY: number,
  cursorX: number,
): Terminal {
  const bufferLines = lines.map((entry) => ({
    length: entry.text.length,
    isWrapped: entry.wrapped ?? false,
    translateToString: (_trimRight: boolean, start: number, end: number) =>
      entry.text.slice(start, end),
  }));

  return {
    buffer: {
      active: {
        baseY: 0,
        cursorY,
        cursorX,
        getLine: (y: number) => bufferLines[y],
      },
    },
  } as Terminal;
}

describe("readTerminalCurrentInput", () => {
  it("reads wrapped command lines from the buffer", () => {
    const terminal = makeMockTerminal(
      [
        { text: "PS C:\\dev> very long comm", wrapped: false },
        { text: "and continues", wrapped: true },
      ],
      1,
      13,
    );

    expect(readTerminalCurrentInput(terminal)).toBe("very long command continues");
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
