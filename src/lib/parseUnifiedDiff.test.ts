import { describe, expect, it } from "vitest";
import {
  buildLinePatch,
  buildSideBySideRows,
  parseUnifiedDiff,
  splitUnifiedDiffByFile,
} from "./parseUnifiedDiff";

const SAMPLE = `diff --git a/src/foo.ts b/src/foo.ts
index abc123..def456 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 line one
-line two
+line two changed
 line three
+line four
@@ -10,2 +11,2 @@
 context a
-removed
+added
`;

describe("parseUnifiedDiff", () => {
  it("returns empty for blank content", () => {
    expect(parseUnifiedDiff("")).toEqual({ fileHeaders: [], hunks: [] });
  });

  it("parses file headers and multiple hunks", () => {
    const parsed = parseUnifiedDiff(SAMPLE);
    expect(parsed.fileHeaders).toHaveLength(4);
    expect(parsed.hunks).toHaveLength(2);
    expect(parsed.hunks[0].oldStart).toBe(1);
    expect(parsed.hunks[0].newStart).toBe(1);
    expect(parsed.hunks[1].oldStart).toBe(10);
  });

  it("tracks old and new line numbers", () => {
    const parsed = parseUnifiedDiff(SAMPLE);
    const lines = parsed.hunks[0].lines;
    expect(lines[0]).toMatchObject({ kind: "context", oldLine: 1, newLine: 1 });
    expect(lines[1]).toMatchObject({ kind: "remove", oldLine: 2, newLine: null });
    expect(lines[2]).toMatchObject({ kind: "add", oldLine: null, newLine: 2 });
    expect(lines[4]).toMatchObject({ kind: "add", oldLine: null, newLine: 4 });
  });

  it("builds apply-ready patch strings with file headers", () => {
    const parsed = parseUnifiedDiff(SAMPLE);
    const patch = parsed.hunks[0].patch;
    expect(patch).toContain("--- a/src/foo.ts");
    expect(patch).toContain("+++ b/src/foo.ts");
    expect(patch).toContain("@@ -1,3 +1,4 @@");
    expect(patch).toContain("-line two");
    expect(patch).toContain("+line two changed");
  });

  it("handles add-only hunk", () => {
    const diff = `--- a/x.txt
+++ b/x.txt
@@ -0,0 +1,2 @@
+hello
+world
`;
    const parsed = parseUnifiedDiff(diff);
    expect(parsed.hunks).toHaveLength(1);
    expect(parsed.hunks[0].lines.every((line) => line.kind === "add")).toBe(true);
  });

  it("handles delete-only hunk", () => {
    const diff = `--- a/x.txt
+++ b/x.txt
@@ -1,2 +0,0 @@
-line one
-line two
`;
    const parsed = parseUnifiedDiff(diff);
    expect(parsed.hunks[0].lines.every((line) => line.kind === "remove")).toBe(true);
  });

  it("treats ++ and -- source as changed lines and preserves following coordinates", () => {
    const parsed = parseUnifiedDiff("--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n---i;\n+++i;\n tail\n");
    expect(parsed.hunks[0].lines).toEqual([
      { kind: "remove", text: "--i;", oldLine: 1, newLine: null },
      { kind: "add", text: "++i;", oldLine: null, newLine: 1 },
      { kind: "context", text: "tail", oldLine: 2, newLine: 2 },
    ]);
    expect(buildLinePatch(parsed.hunks[0], 0)).toContain("---i;\n+++i;");
  });

  it("ends hunk code at the next file boundary and preserves raw CRs in patches", () => {
    const parsed = parseUnifiedDiff(MULTI_FILE.replace("-old\n+new", "-old\r\n+new\r"));
    expect(parsed.hunks[0].lines.map((line) => line.text)).toEqual(["old\r", "new\r"]);
    expect(parsed.hunks[0].patch).not.toContain("diff --git a/src/b.ts");
    expect(buildLinePatch(parsed.hunks[0], 0)).toContain("-old\r\n+new\r\n");
    expect(parsed.hunks[1].lines.map((line) => line.text)).toEqual(["foo", "bar"]);
  });

  it("builds a minimal patch for a single added line", () => {
    const parsed = parseUnifiedDiff(SAMPLE);
    const patch = buildLinePatch(parsed.hunks[0], 4);
    expect(patch).toContain("--- a/src/foo.ts");
    expect(patch).toContain("+line four");
    expect(patch).not.toContain("-line two");
  });

  it("includes paired remove/add when staging one side of a change", () => {
    const parsed = parseUnifiedDiff(SAMPLE);
    const patch = buildLinePatch(parsed.hunks[0], 1);
    expect(patch).toContain("-line two");
    expect(patch).toContain("+line two changed");
  });
});

describe("buildSideBySideRows", () => {
  it("aligns context on both sides", () => {
    const parsed = parseUnifiedDiff(SAMPLE);
    const rows = buildSideBySideRows(parsed.hunks[0]);
    expect(rows[0].left.kind).toBe("context");
    expect(rows[0].right.kind).toBe("context");
    expect(rows[0].left.text).toBe("line one");
  });

  it("keeps old and new context coordinates distinct after an insertion", () => {
    const hunk = parseUnifiedDiff("@@ -1 +1,2 @@\n+inserted\n context\n").hunks[0];
    const context = buildSideBySideRows(hunk)[1];
    expect(context.left.lineNumber).toBe(1);
    expect(context.right.lineNumber).toBe(2);
    expect(context.left.sourceLineIndex).toBe(1);
    expect(context.right.sourceLineIndex).toBe(1);
  });

  it("pairs consecutive remove/add on one row", () => {
    const parsed = parseUnifiedDiff(SAMPLE);
    const rows = buildSideBySideRows(parsed.hunks[0]);
    const paired = rows.find((row) => row.left.kind === "remove" && row.right.kind === "add");
    expect(paired).toMatchObject({
      left: { text: "line two" },
      right: { text: "line two changed" },
    });
  });

  it("pads unpaired additions on the right", () => {
    const parsed = parseUnifiedDiff(SAMPLE);
    const rows = buildSideBySideRows(parsed.hunks[0]);
    const added = rows.find((row) => row.right.text === "line four");
    expect(added?.left.kind).toBe("empty");
    expect(added?.right.kind).toBe("add");
  });
});

const MULTI_FILE = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-old
+new
diff --git a/src/b.ts b/src/b.ts
index 333..444 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -1 +1 @@
-foo
+bar
`;

describe("splitUnifiedDiffByFile", () => {
  it("returns empty for blank content", () => {
    expect(splitUnifiedDiffByFile("")).toEqual([]);
    expect(splitUnifiedDiffByFile("   \n  ")).toEqual([]);
  });

  it("splits multi-file diffs by path", () => {
    const slices = splitUnifiedDiffByFile(MULTI_FILE);
    expect(slices).toHaveLength(2);
    expect(slices[0].path).toBe("src/a.ts");
    expect(slices[0].patch).toContain("-old");
    expect(slices[1].path).toBe("src/b.ts");
    expect(slices[1].patch).toContain("-foo");
  });

  it("handles single-file diff", () => {
    const slices = splitUnifiedDiffByFile(SAMPLE);
    expect(slices).toHaveLength(1);
    expect(slices[0].path).toBe("src/foo.ts");
  });

  it("handles quoted paths with spaces", () => {
    const quoted = `diff --git "a/docs/my file.txt" "b/docs/my file.txt"
index 111..222 100644
--- "a/docs/my file.txt"
+++ "b/docs/my file.txt"
@@ -1 +1 @@
-old
+new
`;
    const slices = splitUnifiedDiffByFile(quoted);
    expect(slices).toHaveLength(1);
    expect(slices[0].path).toBe("docs/my file.txt");
  });
});
