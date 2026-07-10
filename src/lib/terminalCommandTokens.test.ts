import { describe, expect, it } from "vitest";
import { tokenizeCommandLine } from "./terminalCommandTokens";

describe("tokenizeCommandLine", () => {
  it("classifies git status tokens", () => {
    expect(tokenizeCommandLine("git status")).toEqual([
      { start: 0, end: 3, kind: "command", text: "git" },
      { start: 4, end: 10, kind: "subcommand", text: "status" },
    ]);
  });

  it("handles quoted arguments and options", () => {
    const spans = tokenizeCommandLine('docker run --name "my app" $HOME');
    expect(spans.map((span) => span.kind)).toEqual([
      "command",
      "subcommand",
      "option",
      "argument",
      "variable",
    ]);
  });
});
