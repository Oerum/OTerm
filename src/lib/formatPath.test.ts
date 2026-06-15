import { describe, expect, it } from "vitest";
import {
  formatPath,
  formatPathFull,
  formatPathShort,
  formatTitleCompact,
  isDisplayableWorkingDirectory,
} from "./formatPath";

describe("formatPath", () => {
  it("returns ~ for empty or home shorthand", () => {
    expect(formatPath(undefined)).toBe("~");
    expect(formatPath("~")).toBe("~");
  });

  it("shortens user home prefix on Windows, macOS, and Linux", () => {
    expect(formatPath("C:\\Users\\Filip\\Desktop\\oterm")).toBe("~\\Desktop\\oterm");
    expect(formatPath("/Users/filip/Desktop/oterm")).toBe("~/Desktop/oterm");
    expect(formatPath("/home/filip/Desktop/oterm")).toBe("~/Desktop/oterm");
  });

  it("leaves non-user paths unchanged", () => {
    expect(formatPath("C:\\Program Files\\PowerShell\\7")).toBe(
      "C:\\Program Files\\PowerShell\\7",
    );
    expect(formatPath("/var/log/nginx")).toBe("/var/log/nginx");
  });
});

describe("formatPathShort", () => {
  it("returns null for home or empty", () => {
    expect(formatPathShort(undefined)).toBeNull();
    expect(formatPathShort("~")).toBeNull();
  });

  it("returns full path when two segments or fewer after home shorten", () => {
    expect(formatPathShort("C:\\Users\\Filip\\Desktop")).toBe("~\\Desktop");
  });

  it("returns last segment for deeper paths", () => {
    expect(formatPathShort("C:\\Users\\Filip\\Desktop\\oterm\\src")).toBe("src");
    expect(formatPathShort("C:\\Program Files\\PowerShell\\7")).toBe("7");
  });

  it("hides shell executable paths", () => {
    expect(formatPathShort("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBeNull();
    expect(
      formatPathShort("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"),
    ).toBeNull();
    expect(formatPathShort("/bin/bash")).toBeNull();
    expect(formatPathShort("/bin/dash")).toBeNull();
    expect(formatPathShort("/usr/bin/zsh")).toBeNull();
    expect(formatPathShort("/usr/local/bin/fish")).toBeNull();
  });
});

describe("isDisplayableWorkingDirectory", () => {
  it("rejects home shorthand and executable paths", () => {
    expect(isDisplayableWorkingDirectory(undefined)).toBe(false);
    expect(isDisplayableWorkingDirectory("~")).toBe(false);
    expect(isDisplayableWorkingDirectory("C:\\Windows\\System32\\cmd.exe")).toBe(false);
    expect(isDisplayableWorkingDirectory("/bin/bash")).toBe(false);
    expect(isDisplayableWorkingDirectory("/bin/dash")).toBe(false);
  });

  it("accepts normal directories", () => {
    expect(isDisplayableWorkingDirectory("C:\\Users\\Filip\\Desktop\\oterm")).toBe(true);
    expect(isDisplayableWorkingDirectory("/Users/filip/Desktop/oterm")).toBe(true);
  });
});

describe("formatPathFull", () => {
  it("returns null for home or empty", () => {
    expect(formatPathFull(undefined)).toBeNull();
    expect(formatPathFull("~")).toBeNull();
  });

  it("returns home-shortened cwd for tooltip", () => {
    expect(formatPathFull("C:\\Users\\Filip\\Desktop\\oterm")).toBe("~\\Desktop\\oterm");
    expect(formatPathFull("/Users/filip/Desktop/oterm")).toBe("~/Desktop/oterm");
  });

  it("hides shell executable paths", () => {
    expect(formatPathFull("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBeNull();
    expect(formatPathFull("/bin/bash")).toBeNull();
  });
});

describe("formatTitleCompact", () => {
  it("returns empty string for undefined/empty", () => {
    expect(formatTitleCompact(undefined)).toBe("");
    expect(formatTitleCompact("")).toBe("");
  });

  it("leaves normal titles untouched", () => {
    expect(formatTitleCompact("pwsh")).toBe("pwsh");
    expect(formatTitleCompact("Terminal")).toBe("Terminal");
  });

  it("extracts binary/filename from full executable paths", () => {
    expect(formatTitleCompact("C:\\Windows\\System32\\cmd.exe")).toBe("cmd.exe");
    expect(formatTitleCompact("/usr/bin/zsh")).toBe("zsh");
  });

  it("extracts directory name from full directory paths", () => {
    expect(formatTitleCompact("C:\\Users\\Filip\\Desktop\\oterm")).toBe("oterm");
    expect(formatTitleCompact("/home/filip/projects/oterm")).toBe("oterm");
  });
});
