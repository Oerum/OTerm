import { describe, expect, it } from "vitest";
import {
  findLinkAtColumn,
  findPathAtColumn,
  pathMatchToLinkRange,
  scanLineForPaths,
  scanLineForTerminalLinks,
  scanLineForUrls,
} from "./terminalPaths";

describe("scanLineForPaths()", () => {
  it("finds Windows paths in build output", () => {
    const line = "error CS1002: C:\\Projects\\myapp\\src\\Program.cs(12,5): ; expected";
    const paths = scanLineForPaths(line);
    expect(paths).toHaveLength(1);
    expect(paths[0]?.text).toBe("C:\\Projects\\myapp\\src\\Program.cs");
  });

  it("finds Unix paths in find/rg output", () => {
    const line = "./src/lib/terminalPaths.ts:42: export function scanLineForPaths";
    const paths = scanLineForPaths(line);
    expect(paths.some((p) => p.text.includes("terminalPaths.ts"))).toBe(true);
  });

  it("finds absolute Unix paths", () => {
    const line = "Opened /home/user/projects/oterm/README.md for reading";
    const paths = scanLineForPaths(line);
    expect(paths).toHaveLength(1);
    expect(paths[0]?.text).toBe("/home/user/projects/oterm/README.md");
  });

  it("finds quoted paths with spaces", () => {
    const line = 'Copying "C:\\Program Files\\My App\\config.json" to dest';
    const paths = scanLineForPaths(line);
    expect(paths).toHaveLength(1);
    expect(paths[0]?.text).toBe("C:\\Program Files\\My App\\config.json");
  });

  it("finds home-relative paths", () => {
    const line = "Saved to ~/Documents/output.log";
    const paths = scanLineForPaths(line);
    expect(paths).toHaveLength(1);
    expect(paths[0]?.text).toBe("~/Documents/output.log");
  });

  it("finds UNC paths", () => {
    const line = "Mapped \\\\server\\share\\folder\\file.txt successfully";
    const paths = scanLineForPaths(line);
    expect(paths).toHaveLength(1);
    expect(paths[0]?.text).toBe("\\\\server\\share\\folder\\file.txt");
  });

  it("does not match shell prompt lines", () => {
    expect(scanLineForPaths("PS C:\\Users\\Filip\\Desktop\\oterm> ")).toEqual([]);
    expect(scanLineForPaths("user@host:/home/user/projects$ ")).toEqual([]);
  });

  it("does not treat prompt-like fragments as paths", () => {
    const line = "See /var/www> for details";
    const paths = scanLineForPaths(line);
    expect(paths.some((p) => p.text.endsWith(">"))).toBe(false);
  });

  it("does not match bare drive letters in path scan", () => {
    expect(scanLineForPaths("Drive C: is full")).toEqual([]);
  });
});

describe("scanLineForUrls", () => {
  it("finds http and https URLs", () => {
    const line = "Visit https://example.com/path and http://localhost:8080/docs";
    const urls = scanLineForUrls(line);
    expect(urls).toHaveLength(2);
    expect(urls[0]?.text).toBe("https://example.com/path");
    expect(urls[1]?.text).toBe("http://localhost:8080/docs");
  });

  it("trims trailing punctuation from URLs", () => {
    const line = "See https://example.com/page).";
    expect(scanLineForUrls(line)[0]?.text).toBe("https://example.com/page");
  });
});

describe("scanLineForTerminalLinks", () => {
  it("includes both paths and URLs without overlap conflicts", () => {
    const line = "file C:\\tmp\\a.txt url https://example.com";
    const links = scanLineForTerminalLinks(line);
    expect(links.some((l) => l.text === "C:\\tmp\\a.txt")).toBe(true);
    expect(links.some((l) => l.text === "https://example.com")).toBe(true);
  });
});

describe("pathMatchToLinkRange", () => {
  it("converts 0-based path columns to 1-based xterm link range", () => {
    const match = { start: 9, end: 25, text: "C:\\Projects\\foo\\bar.cs" };
    expect(pathMatchToLinkRange(match, 5)).toEqual({
      start: { x: 10, y: 5 },
      end: { x: 25, y: 5 },
    });
  });
});

describe("findLinkAtColumn", () => {
  it("returns a URL under the cursor column", () => {
    const line = "docs at https://example.com/guide for details";
    const url = "https://example.com/guide";
    const start = line.indexOf(url);
    expect(findLinkAtColumn(line, start + 5)?.text).toBe(url);
  });
});

describe("findPathAtColumn", () => {
  it("returns the path under the cursor column", () => {
    const line = "error in C:\\Projects\\foo\\bar.cs: line 10";
    const path = "C:\\Projects\\foo\\bar.cs";
    const start = line.indexOf(path);
    const hit = findPathAtColumn(line, start + 3);
    expect(hit?.text).toBe(path);
  });

  it("returns null when column is not on a path", () => {
    const line = "error in C:\\Projects\\foo\\bar.cs: line 10";
    expect(findPathAtColumn(line, 0)).toBeNull();
  });
});
