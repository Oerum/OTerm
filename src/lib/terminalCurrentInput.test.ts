import type { Terminal } from "@xterm/xterm";
import { describe, expect, it } from "vitest";
import {
  extractInputAfterPrompt,
  isGhostSuggestionCell,
  mergeTerminalDraftSources,
  readTerminalCurrentInput,
  resolveTerminalAutocompleteInput,
} from "./terminalCurrentInput";

describe("extractInputAfterPrompt", () => {
  it("strips PowerShell prompts", () => {
    expect(extractInputAfterPrompt("PS C:\\Users\\Oerum\\Desktop\\oterm> hello")).toBe(
      "hello",
    );
    expect(extractInputAfterPrompt("PS D:\\Projects> ")).toBe("");
  });

  it("strips CMD prompts", () => {
    expect(extractInputAfterPrompt("C:\\Users\\Oerum> dir")).toBe("dir");
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
    expect(extractInputAfterPrompt('C:\\Users\\Oerum> echo "hello > world"')).toBe(
      'echo "hello > world"',
    );
  });
});

type MockCellStyle = {
  dim?: boolean;
  italic?: boolean;
  fgPalette?: number;
};

function makeMockTerminal(
  lines: { text: string; wrapped?: boolean; ghostFrom?: number; cellStyles?: MockCellStyle[] }[],
  cursorY: number,
  cursorX: number,
): Terminal {
  const bufferLines = lines.map((entry) => {
    const text = entry.text;
    const ghostFrom = entry.ghostFrom ?? text.length;
    return {
      length: text.length,
      isWrapped: entry.wrapped ?? false,
      translateToString: (_trimRight: boolean, start: number, end: number) =>
        text.slice(start, end),
      getCell: (x: number) => {
        const ch = text[x];
        if (ch === undefined) return undefined;
        const style = entry.cellStyles?.[x];
        const dim = style?.dim ?? x >= ghostFrom;
        const italic = style?.italic ?? false;
        const fgPalette = style?.fgPalette;
        return {
          getChars: () => ch,
          isDim: () => (dim ? 1 : 0),
          isItalic: () => (italic ? 1 : 0),
          isFgPalette: () => fgPalette !== undefined,
          getFgColor: () => fgPalette ?? 0,
        };
      },
    };
  });

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

describe("isGhostSuggestionCell", () => {
  it("detects dim, italic, and muted palette styling", () => {
    expect(
      isGhostSuggestionCell({
        isDim: () => 1,
        isItalic: () => 0,
        isFgPalette: () => false,
        getFgColor: () => 0,
      } as never),
    ).toBe(true);
    expect(
      isGhostSuggestionCell({
        isDim: () => 0,
        isItalic: () => 1,
        isFgPalette: () => false,
        getFgColor: () => 0,
      } as never),
    ).toBe(true);
    expect(
      isGhostSuggestionCell({
        isDim: () => 0,
        isItalic: () => 0,
        isFgPalette: () => true,
        getFgColor: () => 240,
      } as never),
    ).toBe(true);
    expect(
      isGhostSuggestionCell({
        isDim: () => 0,
        isItalic: () => 0,
        isFgPalette: () => true,
        getFgColor: () => 15,
      } as never),
    ).toBe(false);
  });

  it("treats cells without optional style methods as normal text", () => {
    expect(
      isGhostSuggestionCell({
        getChars: () => "g",
        getWidth: () => 1,
        getCode: () => "g".charCodeAt(0),
      } as never),
    ).toBe(false);
  });
});

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

  it("stops before dim ghost suggestion cells on the cursor line", () => {
    const line = "PS C:\\dev> git status";
    const ghostFrom = line.indexOf("tus");
    const terminal = makeMockTerminal([{ text: line, ghostFrom }], 0, line.length);

    expect(readTerminalCurrentInput(terminal)).toBe("git sta");
  });

  it("stops before muted palette ghost suggestion cells", () => {
    const line = "PS C:\\dev> git status";
    const ghostFrom = line.indexOf("tus");
    const cellStyles = line.split("").map((_, index) =>
      index >= ghostFrom ? { fgPalette: 240 } : {},
    );
    const terminal = makeMockTerminal([{ text: line, cellStyles }], 0, line.length);

    expect(readTerminalCurrentInput(terminal)).toBe("git sta");
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

  it("still prefers longer buffer for submit flows when buffer extends draft", () => {
    expect(mergeTerminalDraftSources("git status", "git sta")).toBe("git status");
  });
});

describe("resolveTerminalAutocompleteInput", () => {
  it("prefers keystroke draft over buffer that includes ghost suffix", () => {
    const line = "PS C:\\dev> git status";
    const ghostFrom = line.indexOf("tus");
    const terminal = makeMockTerminal([{ text: line, ghostFrom }], 0, line.length);

    expect(resolveTerminalAutocompleteInput(terminal, "git sta")).toBe("git sta");
  });

  it("falls back to buffer read when draft is empty", () => {
    const terminal = makeMockTerminal([{ text: "PS C:\\dev> npm test" }], 0, 20);

    expect(resolveTerminalAutocompleteInput(terminal, "")).toBe("npm test");
  });
});
