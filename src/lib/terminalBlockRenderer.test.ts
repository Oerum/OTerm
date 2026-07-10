import { describe, expect, it } from "vitest";
import { expandBlockEndLine, finishTerminalBlock, resolveBlockExitCode } from "./terminalBlocks";
import { createTerminalBlock } from "./terminalBlocks";

describe("terminal block failure resolution", () => {
  it("marks a finished block as failure when fallback heuristics match", () => {
    const output =
      "asdasd: The term 'asdasd' is not recognized as a name of a cmdlet, function, script file, or executable program.";
    const exitCode = resolveBlockExitCode(output, 0, "pwsh");
    const block = finishTerminalBlock(
      {
        ...createTerminalBlock("asdasd"),
        outputText: output,
        commandMarkerLine: 2,
        endMarkerLine: 4,
      },
      exitCode,
    );
    expect(block.status).toBe("failure");
    expect(block.exitCode).toBe(1);
  });

  it("keeps success for clean git status output", () => {
    const output = "On branch main\nnothing to commit, working tree clean";
    const exitCode = resolveBlockExitCode(output, 0, "pwsh");
    const block = finishTerminalBlock(createTerminalBlock("git status"), exitCode);
    expect(block.status).toBe("success");
  });
});

describe("finished block line spans", () => {
  it("expandBlockEndLine would swallow later commands if applied to finished blocks", () => {
    const lines = [
      "C:\\repo> asd",
      "'asd' is not recognized as an internal or external command",
      "C:\\repo> asdasd",
      "'asdasd' is not recognized as an internal or external command",
      "C:\\repo> ",
    ];
    const buffer = {
      getLine: (line: number) => ({
        translateToString: (trimRight: boolean) => {
          const text = lines[line] ?? "";
          return trimRight ? text.trimEnd() : text;
        },
      }),
    };

    expect(expandBlockEndLine(buffer, 0, 2)).toBe(1);
    expect(expandBlockEndLine(buffer, 0, 4)).toBe(3);
  });
});
