import { describe, expect, it } from "vitest";
import {
  blockLineSpan,
  canAttachBlockMetaAbove,
  createTerminalBlock,
  derivePowerShellExitCode,
  expandBlockEndLine,
  finishTerminalBlock,
  formatBlockDuration,
  looksLikePowerShellFailure,
  looksLikeTerminalClear,
  parseOsc133Payload,
  parseOsc7Payload,
  resolveBlockExitCode,
} from "./terminalBlocks";

describe("parseOsc133Payload", () => {
  it("parses prompt and command lifecycle markers", () => {
    expect(parseOsc133Payload("A")).toEqual({ kind: "prompt-start" });
    expect(parseOsc133Payload("B")).toEqual({ kind: "prompt-end" });
    expect(parseOsc133Payload("C")).toEqual({ kind: "command-start" });
    expect(parseOsc133Payload("D;0")).toEqual({ kind: "command-finish", exitCode: 0 });
    expect(parseOsc133Payload("D;127")).toEqual({ kind: "command-finish", exitCode: 127 });
  });
});

describe("parseOsc7Payload", () => {
  it("parses file URLs into cwd paths", () => {
    expect(parseOsc7Payload("file:///C:/Users/Filip/Desktop/oterm")).toBe(
      "C:\\Users\\Filip\\Desktop\\oterm",
    );
    expect(parseOsc7Payload("file:///home/filip/projects")).toBe("/home/filip/projects");
  });
});

describe("derivePowerShellExitCode", () => {
  it("returns 1 for native cmdlet failures when LASTEXITCODE is unset", () => {
    expect(derivePowerShellExitCode(null, false)).toBe(1);
    expect(derivePowerShellExitCode(0, false)).toBe(1);
  });

  it("preserves nonzero LASTEXITCODE", () => {
    expect(derivePowerShellExitCode(2, false)).toBe(2);
  });
});

describe("looksLikePowerShellFailure", () => {
  it("detects unknown command errors", () => {
    expect(
      looksLikePowerShellFailure(
        "asdasd: The term 'asdasd' is not recognized as a name of a cmdlet, function, script file, or executable program.",
      ),
    ).toBe(true);
  });
});

describe("resolveBlockExitCode", () => {
  it("overrides OSC zero when PowerShell output looks like failure", () => {
    const output =
      "asdasd: The term 'asdasd' is not recognized as a name of a cmdlet, function, script file, or executable program.";
    expect(resolveBlockExitCode(output, 0, "pwsh")).toBe(1);
  });

  it("keeps OSC success for clean output", () => {
    expect(resolveBlockExitCode("On branch main\nnothing to commit", 0, "pwsh")).toBe(0);
  });
});

describe("finishTerminalBlock", () => {
  it("marks nonzero exits as failures", () => {
    const block = finishTerminalBlock(createTerminalBlock("git status"), 1);
    expect(block.status).toBe("failure");
    expect(block.exitCode).toBe(1);
  });

  it("formats duration text", () => {
    const block = createTerminalBlock("echo hi");
    block.finishedAt = block.startedAt + 41;
    expect(formatBlockDuration(block)).toBe("(0.041s)");
  });
});

describe("blockLineSpan", () => {
  it("returns the full command/output range", () => {
    const block = createTerminalBlock("git status");
    block.commandMarkerLine = 4;
    block.endMarkerLine = 7;
    expect(blockLineSpan(block)).toEqual({ start: 4, end: 7 });
  });

  it("ignores a later prompt-start marker when computing span", () => {
    const block = createTerminalBlock("asdasd");
    block.commandMarkerLine = 1;
    block.startMarkerLine = 8;
    block.endMarkerLine = 3;
    expect(blockLineSpan(block)).toEqual({ start: 1, end: 3 });
  });
});

describe("expandBlockEndLine", () => {
  it("includes every non-empty output line before the next prompt", () => {
    const lines = [
      "PS C:\\dev> asad",
      "asad: The term 'asad' is not recognized",
      "Check the spelling of the name, or if a path was included, verify that the path is correct and try again.",
    ];
    const buffer = {
      getLine: (line: number) =>
        lines[line]
          ? { translateToString: () => lines[line]! }
          : undefined,
    };
    expect(expandBlockEndLine(buffer, 0, 3)).toBe(2);
  });
});

describe("canAttachBlockMetaAbove", () => {
  const bufferOf = (lines: string[]) => ({
    getLine: (line: number) =>
      lines[line] === undefined
        ? undefined
        : { translateToString: () => lines[line]! },
  });

  it("allows meta when the row above the block is blank", () => {
    expect(canAttachBlockMetaAbove(bufferOf(["", "PS C:\\dev> f"]), 1)).toBe(true);
    expect(canAttachBlockMetaAbove(bufferOf(["   ", "PS C:\\dev> f"]), 1)).toBe(true);
  });

  it("rejects meta when it would overlay the previous block's output", () => {
    expect(
      canAttachBlockMetaAbove(bufferOf(["nothing to commit, working tree clean", "PS C:\\dev> f"]), 1),
    ).toBe(false);
  });

  it("rejects meta on the first buffer row", () => {
    expect(canAttachBlockMetaAbove(bufferOf(["PS C:\\dev> f"]), 0)).toBe(false);
  });
});

describe("looksLikeTerminalClear", () => {
  it("detects erase-screen and erase-scrollback sequences", () => {
    expect(looksLikeTerminalClear("\x1b[2J")).toBe(true);
    expect(looksLikeTerminalClear("\x1b[H\x1b[2J")).toBe(true);
    expect(looksLikeTerminalClear("\x1b[3J")).toBe(true);
    expect(looksLikeTerminalClear("hello")).toBe(false);
  });
});
