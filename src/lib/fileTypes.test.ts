import { describe, expect, it } from "vitest";
import { getFileType } from "./fileTypes";

describe("getFileType", () => {
  it("returns 'dir' for directories regardless of name", () => {
    expect(getFileType("folder", true)).toBe("dir");
    expect(getFileType("folder.zip", true)).toBe("dir");
  });

  it("identifies archive extensions correctly", () => {
    expect(getFileType("archive.zip", false)).toBe("archive");
    expect(getFileType("archive.tar.gz", false)).toBe("archive");
    expect(getFileType("FILE.7Z", false)).toBe("archive");
  });

  it("identifies media extensions correctly", () => {
    expect(getFileType("photo.jpg", false)).toBe("media");
    expect(getFileType("icon.SVG", false)).toBe("media");
    expect(getFileType("video.mp4", false)).toBe("media");
  });

  it("identifies code extensions correctly", () => {
    expect(getFileType("index.ts", false)).toBe("code");
    expect(getFileType("App.vue", false)).toBe("code");
    expect(getFileType(".gitignore", false)).toBe("file");
  });

  it("defaults to 'file' for unknown extensions or files without extension", () => {
    expect(getFileType("plain_text", false)).toBe("file");
    expect(getFileType("document.unknownext", false)).toBe("file");
    expect(getFileType("file.", false)).toBe("file");
  });
});
