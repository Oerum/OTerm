import { describe, expect, it } from "vitest";
import {
  detectMentionQuery,
  formatMentionPath,
  insertMentionText,
} from "./agentComposerMentions";

describe("agentComposerMentions", () => {
  describe("detectMentionQuery", () => {
    it("returns null when no @ is typed", () => {
      expect(detectMentionQuery("hello world", 5)).toBeNull();
    });

    it("detects @ at start of string", () => {
      expect(detectMentionQuery("@App", 4)).toEqual({
        start: 0,
        end: 4,
        query: "App",
      });
    });

    it("detects @ after whitespace", () => {
      expect(detectMentionQuery("check @src/comp", 15)).toEqual({
        start: 6,
        end: 15,
        query: "src/comp",
      });
    });

    it("returns null if @ is inside an email or word without leading space", () => {
      expect(detectMentionQuery("user@domain.com", 11)).toBeNull();
    });

    it("returns null if query contains whitespace", () => {
      expect(detectMentionQuery("@App Vue", 8)).toBeNull();
    });

    it("detects @ right after typed character", () => {
      expect(detectMentionQuery("please review @", 15)).toEqual({
        start: 14,
        end: 15,
        query: "",
      });
    });

    it("detects @ preceded by bracket or parenthesis", () => {
      expect(detectMentionQuery("(@src", 5)).toEqual({
        start: 1,
        end: 5,
        query: "src",
      });
    });
  });

  describe("formatMentionPath", () => {
    it("converts backslashes to forward slashes", () => {
      expect(formatMentionPath("src\\components\\AgentComposer.vue")).toBe(
        "src/components/AgentComposer.vue",
      );
    });

    it("strips rootCwd prefix to make relative path", () => {
      expect(
        formatMentionPath(
          "C:\\Users\\Filip\\desktop\\oterm\\src\\App.vue",
          "C:\\Users\\Filip\\desktop\\oterm",
        ),
      ).toBe("src/App.vue");
    });
  });

  describe("insertMentionText", () => {
    it("replaces @query with @formattedPath and adds trailing space", () => {
      const result = insertMentionText(
        "look at @App for details",
        12,
        "src/App.vue",
      );
      expect(result.text).toBe("look at @src/App.vue  for details");
      expect(result.newCursorIndex).toBe(21);
    });

    it("quotes path with spaces", () => {
      const result = insertMentionText(
        "check @my file",
        9,
        "my folder/my file.txt",
      );
      expect(result.text).toBe("check @\"my folder/my file.txt\"  file");
    });

    it("respects rootCwd formatting", () => {
      const result = insertMentionText(
        "inspect @comp",
        13,
        "C:\\repo\\src\\components\\Tile.vue",
        "C:\\repo",
      );
      expect(result.text).toBe("inspect @src/components/Tile.vue ");
      expect(result.newCursorIndex).toBe(33);
    });
  });
});
