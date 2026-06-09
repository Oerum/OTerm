import { describe, expect, it } from "vitest";
import { cwdForNewTerminal } from "./newTerminalCwd";

describe("cwdForNewTerminal", () => {
  it("returns undefined when there is no active cwd", () => {
    expect(cwdForNewTerminal(undefined)).toBeUndefined();
  });

  it("returns undefined when active cwd is ~", () => {
    expect(cwdForNewTerminal("~")).toBeUndefined();
  });

  it("inherits a real active cwd", () => {
    expect(cwdForNewTerminal("C:\\Projects\\myapp")).toBe("C:\\Projects\\myapp");
  });

  it("prefers explicit cwd over active cwd", () => {
    expect(cwdForNewTerminal("C:\\Old", "D:\\New")).toBe("D:\\New");
  });

  it("returns undefined when explicit cwd is ~", () => {
    expect(cwdForNewTerminal("C:\\Projects\\myapp", "~")).toBeUndefined();
  });
});
