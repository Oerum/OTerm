import { describe, expect, it } from "vitest";
import type { GitFileEntry } from "../types/git";
import {
  buildSourceControlTreeRows,
  collectSourceControlFolderPaths,
  compareGitPaths,
  filterGitFileEntries,
  normalizeGitPath,
  parseFilePath,
  sortGitFileEntriesByPath,
} from "./gitFilePaths";

function makeEntry(path: string, status = "M"): GitFileEntry {
  return {
    path,
    status,
    staged: false,
    untracked: status === "??",
    additions: 1,
    deletions: 0,
  };
}

describe("gitFilePaths", () => {
  it("normalizes slashes and strips leading/trailing separators", () => {
    expect(normalizeGitPath("src/lib/gitFilePaths.ts")).toBe("src/lib/gitFilePaths.ts");
    expect(normalizeGitPath("//src\\lib\\gitFilePaths.ts//")).toBe("src/lib/gitFilePaths.ts");
    expect(normalizeGitPath("///")).toBe("");
  });

  it("parses file name and directory path across slash styles", () => {
    expect(parseFilePath("src\\components\\SourceControlPanel.vue")).toEqual({
      fileName: "SourceControlPanel.vue",
      dirPath: "src/components",
    });
    expect(parseFilePath("package.json")).toEqual({
      fileName: "package.json",
      dirPath: "",
    });
  });

  it("orders folders before root files, handles numeric and case tie-breaking, and checks equality", () => {
    const entries = [
      makeEntry("zebra.ts"),
      makeEntry("alpha.ts"),
      makeEntry("src/utils/z.ts"),
      makeEntry("src/utils/a.ts"),
      makeEntry("api/index.ts"),
    ];

    const sorted = sortGitFileEntriesByPath(entries).map((e) => e.path);
    expect(sorted).toEqual([
      "api/index.ts",
      "src/utils/a.ts",
      "src/utils/z.ts",
      "alpha.ts",
      "zebra.ts",
    ]);
    expect(compareGitPaths("a/file.ts", "a.ts")).toBeLessThan(0);
    expect(compareGitPaths("a.ts", "a/file.ts")).toBeGreaterThan(0);
    expect(compareGitPaths("a/file.ts", "a/file.ts")).toBe(0);
    expect(compareGitPaths("README.md", "readme.md")).not.toBe(0);
    expect(compareGitPaths("file2.ts", "file10.ts")).toBeLessThan(0);
    expect(sortGitFileEntriesByPath([])).toEqual([]);
    expect(sortGitFileEntriesByPath([entries[0]])).toEqual([entries[0]]);
  });

  it("filters entries case-insensitively across slash styles and returns original reference when query is empty", () => {
    const entries = [
      makeEntry("API.Application/Integrations/Sedna/Preferences/SednaUserPreferenceKeys.cs"),
      makeEntry("API.CleanQuote/Program.cs"),
      makeEntry("README.md"),
    ];

    expect(filterGitFileEntries(entries, "   ")).toBe(entries);
    expect(filterGitFileEntries([], "sedna")).toEqual([]);
    expect(filterGitFileEntries(entries, "sedna\\preferences").map((e) => e.path)).toEqual([
      "API.Application/Integrations/Sedna/Preferences/SednaUserPreferenceKeys.cs",
    ]);
    expect(filterGitFileEntries(entries, "PROGRAM").map((e) => e.path)).toEqual([
      "API.CleanQuote/Program.cs",
    ]);
  });

  it("builds a compacted folder tree similar to VS and VS Code", () => {
    const entries = [
      makeEntry("README.md"),
      makeEntry("API.CleanQuote/Program.cs"),
      makeEntry("API.Application/Integrations/Sedna/Preferences/SednaUserPreferenceKeys.cs"),
      makeEntry("API.Application/Integrations/Sedna/Preferences/ISednaUserPreferenceRepository.cs"),
      makeEntry("API.Application/Integrations/Sedna/CleaningHistory/CleaningService.cs"),
      makeEntry("API.Application/Integrations/Sedna/Chartering/CharterService.cs"),
    ];

    const rows = buildSourceControlTreeRows(entries);

    expect(
      rows.map((r) =>
        r.kind === "folder"
          ? { kind: "folder", name: r.name, path: r.path, depth: r.depth, count: r.filePaths.length }
          : { kind: "file", name: r.fileName, depth: r.depth },
      ),
    ).toEqual([
      {
        kind: "folder",
        name: "API.Application/Integrations/Sedna",
        path: "API.Application/Integrations/Sedna",
        depth: 0,
        count: 4,
      },
      {
        kind: "folder",
        name: "Chartering",
        path: "API.Application/Integrations/Sedna/Chartering",
        depth: 1,
        count: 1,
      },
      { kind: "file", name: "CharterService.cs", depth: 2 },
      {
        kind: "folder",
        name: "CleaningHistory",
        path: "API.Application/Integrations/Sedna/CleaningHistory",
        depth: 1,
        count: 1,
      },
      { kind: "file", name: "CleaningService.cs", depth: 2 },
      {
        kind: "folder",
        name: "Preferences",
        path: "API.Application/Integrations/Sedna/Preferences",
        depth: 1,
        count: 2,
      },
      { kind: "file", name: "ISednaUserPreferenceRepository.cs", depth: 2 },
      { kind: "file", name: "SednaUserPreferenceKeys.cs", depth: 2 },
      {
        kind: "folder",
        name: "API.CleanQuote",
        path: "API.CleanQuote",
        depth: 0,
        count: 1,
      },
      { kind: "file", name: "Program.cs", depth: 1 },
      { kind: "file", name: "README.md", depth: 0 },
    ]);
  });

  it("handles Windows backslashes, consecutive slashes, mixed folder-and-file depths, and preSorted entries", () => {
    const windowsEntries = [
      makeEntry("///"),
      makeEntry("src\\\\index.ts"),
      makeEntry("src//components//Button.vue"),
    ];
    const sortedWindows = sortGitFileEntriesByPath(windowsEntries);
    const windowsRows = buildSourceControlTreeRows(sortedWindows, undefined, true);
    expect(
      windowsRows.map((r) =>
        r.kind === "folder"
          ? { kind: "folder", name: r.name, depth: r.depth }
          : { kind: "file", name: r.fileName, depth: r.depth },
      ),
    ).toEqual([
      { kind: "folder", name: "src", depth: 0 },
      { kind: "folder", name: "components", depth: 1 },
      { kind: "file", name: "Button.vue", depth: 2 },
      { kind: "file", name: "index.ts", depth: 1 },
    ]);
  });

  it("omits descendants when a folder is collapsed and handles empty or single-entry input", () => {
    expect(buildSourceControlTreeRows([])).toEqual([]);
    expect(buildSourceControlTreeRows([makeEntry("root.ts")]).map((r) => r.key)).toEqual([
      "file:root.ts",
    ]);

    const entries = [
      makeEntry("API.Application/Integrations/Sedna/Preferences/SednaUserPreferenceKeys.cs"),
      makeEntry("API.Application/Integrations/Sedna/Chartering/CharterService.cs"),
    ];

    const collapsed = new Set(["API.Application/Integrations/Sedna/Chartering"]);
    const rows = buildSourceControlTreeRows(entries, collapsed);

    expect(
      rows.map((r) => (r.kind === "folder" ? `dir:${r.name}` : `file:${r.fileName}`)),
    ).toEqual([
      "dir:API.Application/Integrations/Sedna",
      "dir:Chartering",
      "dir:Preferences",
      "file:SednaUserPreferenceKeys.cs",
    ]);

    expect(Array.from(collectSourceControlFolderPaths(entries))).toEqual([
      "API.Application/Integrations/Sedna",
      "API.Application/Integrations/Sedna/Chartering",
      "API.Application/Integrations/Sedna/Preferences",
    ]);
  });
});
