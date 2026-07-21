import { describe, expect, it } from "vitest";
import { ref } from "vue";
import type { CommandPaletteItem } from "../lib/commandPaletteItems";
import { clampActiveIndex, useCommandPalette } from "./useCommandPalette";

describe("clampActiveIndex", () => {
  it("clamps to 0 for empty list", () => {
    expect(clampActiveIndex(3, 0)).toBe(0);
  });
  it("wraps not — clamps high", () => {
    expect(clampActiveIndex(9, 3)).toBe(2);
  });
  it("clamps low", () => {
    expect(clampActiveIndex(-1, 3)).toBe(0);
  });
});

describe("useCommandPalette", () => {
  it("openPalette can seed a history-mode query", () => {
    const items = ref<CommandPaletteItem[]>([]);
    const pal = useCommandPalette(items);
    pal.openPalette({ initialQuery: "$" });
    expect(pal.open.value).toBe(true);
    expect(pal.query.value).toBe("$");
  });
});
