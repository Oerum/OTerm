import { describe, expect, it } from "vitest";
import { diffWords } from "./wordDiff";

describe("diffWords", () => {
  it("should match identical strings", () => {
    const oldStr = "const foo = 42;";
    const newStr = "const foo = 42;";
    const { oldChunks, newChunks } = diffWords(oldStr, newStr);

    expect(oldChunks).toEqual([
      { type: "common", text: "const" },
      { type: "common", text: " " },
      { type: "common", text: "foo" },
      { type: "common", text: " " },
      { type: "common", text: "=" },
      { type: "common", text: " " },
      { type: "common", text: "42" },
      { type: "common", text: ";" },
    ]);
    expect(newChunks).toEqual(oldChunks);
  });

  it("should identify word updates", () => {
    const oldStr = "let countCollapsed = ref(false);";
    const newStr = "let countCollapse = ref(true);";
    const { oldChunks, newChunks } = diffWords(oldStr, newStr);

    // Checks old chunks
    const removedCount = oldChunks.filter((c) => c.type === "removed");
    const addedInOld = oldChunks.filter((c) => c.type === "added");
    expect(removedCount.map((c) => c.text)).toEqual(["countCollapsed", "false"]);
    expect(addedInOld).toHaveLength(0);

    // Checks new chunks
    const addedCount = newChunks.filter((c) => c.type === "added");
    const removedInNew = newChunks.filter((c) => c.type === "removed");
    expect(addedCount.map((c) => c.text)).toEqual(["countCollapse", "true"]);
    expect(removedInNew).toHaveLength(0);
  });
});
