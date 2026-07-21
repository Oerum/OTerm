import { describe, expect, it } from "vitest";
import { categoriesForPaletteMode, parsePaletteQuery } from "./commandPaletteMode";

describe("parsePaletteQuery", () => {
  it("defaults to all mode", () => {
    expect(parsePaletteQuery("docker")).toEqual({
      mode: "all",
      needle: "docker",
      prefix: null,
    });
  });

  it("parses history mode", () => {
    expect(parsePaletteQuery("$git st")).toEqual({
      mode: "history",
      needle: "git st",
      prefix: "$",
    });
  });

  it("parses terminals mode", () => {
    expect(parsePaletteQuery("@oterm")).toEqual({
      mode: "terminals",
      needle: "oterm",
      prefix: "@",
    });
  });

  it("parses commands mode", () => {
    expect(parsePaletteQuery(">docker")).toEqual({
      mode: "commands",
      needle: "docker",
      prefix: ">",
    });
  });

  it("parses agents mode", () => {
    expect(parsePaletteQuery("#claude")).toEqual({
      mode: "agents",
      needle: "claude",
      prefix: "#",
    });
  });
});

describe("categoriesForPaletteMode", () => {
  it("returns null for all mode", () => {
    expect(categoriesForPaletteMode("all")).toBeNull();
  });

  it("scopes history mode", () => {
    expect(categoriesForPaletteMode("history")).toEqual(["history"]);
  });
});
