import type { Terminal } from "@xterm/xterm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TerminalBlockRenderer } from "./terminalBlockRenderer";
import { blockLineSpan, expandBlockEndLine, finishTerminalBlock, resolveBlockExitCode } from "./terminalBlocks";
import { createTerminalBlock } from "./terminalBlocks";
import type { TerminalTheme } from "../types/terminalTheme";

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

type MockBufferState = { lines: string[]; cursorY: number };

function makeMockTerminal(state: MockBufferState): Terminal {
  return {
    buffer: {
      active: {
        baseY: 0,
        get cursorY() {
          return state.cursorY;
        },
        cursorX: 0,
        type: "normal",
        getLine: (y: number) =>
          state.lines[y] === undefined
            ? undefined
            : {
                isWrapped: false,
                translateToString: (trimRight: boolean) =>
                  trimRight ? state.lines[y]!.trimEnd() : state.lines[y]!,
              },
      },
    },
  } as unknown as Terminal;
}

const MOCK_THEME = {
  blocks: {
    failureBackground: "#400",
    successBackground: "#040",
    failureText: "#f88",
    meta: "#888",
  },
} as unknown as TerminalTheme;

const PROMPT = "PS C:\\Users\\Filip\\Desktop\\CleanQuote> ";
const ERROR_LINES = [
  "f : The term 'f' is not recognized as the name of a cmdlet, function, script file, or operable program. Check",
  "the spelling of the name, or if a path was included, verify that the path is correct and try again.",
];

function makeFailureScenario() {
  const state: MockBufferState = { lines: [`${PROMPT}f`], cursorY: 0 };
  const renderer = new TerminalBlockRenderer(makeMockTerminal(state), MOCK_THEME, {
    shellId: "pwsh",
  });
  renderer.noteSubmittedCommand("f");
  renderer.appendOutput(ERROR_LINES.join("\r\n"));
  return { state, renderer };
}

describe("finalizeOnPromptReady buffer-parse ordering", () => {
  beforeAll(() => {
    vi.stubGlobal("window", { setTimeout: () => 0, clearTimeout: () => {} });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("spans the full multiline error when finalized after the buffer reflects output", () => {
    const { state, renderer } = makeFailureScenario();

    state.lines = [`${PROMPT}f`, ...ERROR_LINES, PROMPT];
    state.cursorY = 3;
    renderer.finalizeOnPromptReady();

    const [block] = renderer.getBlocks();
    expect(block?.status).toBe("failure");
    expect(block?.exitCode).toBe(1);
    expect(blockLineSpan(block!)).toEqual({ start: 0, end: 2 });
  });

  it("freezes a one-row span when finalized against a stale buffer, repaired only by a later prompt pass", () => {
    const { state, renderer } = makeFailureScenario();

    // Stale: xterm parsed the command echo + newline but not the error output.
    state.cursorY = 1;
    renderer.finalizeOnPromptReady();
    const [stale] = renderer.getBlocks();
    expect(stale?.status).toBe("failure");
    expect(blockLineSpan(stale!)).toEqual({ start: 0, end: 0 });

    // A second prompt detection after parsing reconciles the frozen span.
    state.lines = [`${PROMPT}f`, ...ERROR_LINES, PROMPT];
    state.cursorY = 3;
    renderer.finalizeOnPromptReady();
    const [repaired] = renderer.getBlocks();
    expect(blockLineSpan(repaired!)).toEqual({ start: 0, end: 2 });
  });

  it("selects and copies the last failed block", () => {
    const { state, renderer } = makeFailureScenario();
    state.lines = [`${PROMPT}f`, ...ERROR_LINES, PROMPT];
    state.cursorY = 3;
    renderer.finalizeOnPromptReady();

    const failed = renderer.getLastFailedBlock();
    expect(failed?.status).toBe("failure");
    expect(failed?.command).toBe("f");

    renderer.selectBlock(failed!.id);
    expect(renderer.getSelectedBlock()?.id).toBe(failed!.id);

    const copied = renderer.copySelectedBlock();
    expect(copied?.command).toBe("f");
    expect(copied?.output.length).toBeGreaterThan(0);
  });
});
