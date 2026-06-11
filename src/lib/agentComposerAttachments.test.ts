import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  readComposerClipboardImagePathMock,
  readNativeClipboardImagePathMock,
} = vi.hoisted(() => ({
  readComposerClipboardImagePathMock: vi.fn<() => Promise<string | null>>(),
  readNativeClipboardImagePathMock: vi.fn<() => Promise<string | null>>(),
}));

vi.mock("./clipboard", () => ({
  readComposerClipboardImagePath: readComposerClipboardImagePathMock,
  readNativeClipboardImagePath: readNativeClipboardImagePathMock,
}));

import {
  attachmentDisplayName,
  extensionFromImageMimeType,
  formatAgentComposerMessage,
  isMediaAttachmentPath,
  readClipboardImagePaths,
} from "./agentComposerAttachments";

describe("isMediaAttachmentPath", () => {
  it("accepts common image and video extensions", () => {
    expect(isMediaAttachmentPath("C:\\Users\\Filip\\shot.PNG")).toBe(true);
    expect(isMediaAttachmentPath("/tmp/demo.webm")).toBe(true);
  });

  it("rejects non-media files", () => {
    expect(isMediaAttachmentPath("C:\\repo\\main.ts")).toBe(false);
    expect(isMediaAttachmentPath("/tmp/readme")).toBe(false);
  });
});

describe("extensionFromImageMimeType", () => {
  it("maps common clipboard image mime types", () => {
    expect(extensionFromImageMimeType("image/png")).toBe("png");
    expect(extensionFromImageMimeType("image/jpeg")).toBe("jpg");
    expect(extensionFromImageMimeType("image/webp")).toBe("webp");
  });

  it("returns null for unsupported mime types", () => {
    expect(extensionFromImageMimeType("text/plain")).toBeNull();
    expect(extensionFromImageMimeType("video/mp4")).toBeNull();
  });
});

describe("attachmentDisplayName", () => {
  it("returns the final path segment", () => {
    expect(attachmentDisplayName("C:\\Users\\Filip\\Pictures\\logo.png")).toBe("logo.png");
  });
});

describe("formatAgentComposerMessage", () => {
  it("returns trimmed text when there are no attachments", () => {
    expect(formatAgentComposerMessage("  fix this  ", [])).toBe("fix this");
  });

  it("returns only attachment paths when text is empty", () => {
    expect(
      formatAgentComposerMessage("   ", [
        "C:\\Users\\Filip\\Pictures\\shot.png",
        "D:\\clips\\demo.mp4",
      ]),
    ).toBe("C:\\Users\\Filip\\Pictures\\shot.png\nD:\\clips\\demo.mp4");
  });

  it("appends each absolute path on its own line after the text", () => {
    expect(
      formatAgentComposerMessage("fix this logo", [
        "C:\\Users\\Filip\\Pictures\\shot.png",
        "D:\\clips\\demo.mp4",
      ]),
    ).toBe(
      "fix this logo\nC:\\Users\\Filip\\Pictures\\shot.png\nD:\\clips\\demo.mp4",
    );
  });

  it("preserves multiline text before attachment paths", () => {
    expect(
      formatAgentComposerMessage("line one\nline two", [
        "C:\\Users\\Filip\\Pictures\\shot.png",
      ]),
    ).toBe("line one\nline two\nC:\\Users\\Filip\\Pictures\\shot.png");
  });
});

describe("readClipboardImagePaths", () => {
  beforeEach(() => {
    readComposerClipboardImagePathMock.mockReset();
    readNativeClipboardImagePathMock.mockReset();
  });

  it("falls back to composer clipboard image read by default", async () => {
    readComposerClipboardImagePathMock.mockResolvedValue("C:\\Temp\\composer-attachments\\clip.png");

    await expect(readClipboardImagePaths()).resolves.toEqual([
      "C:\\Temp\\composer-attachments\\clip.png",
    ]);
    expect(readComposerClipboardImagePathMock).toHaveBeenCalledTimes(1);
    expect(readNativeClipboardImagePathMock).not.toHaveBeenCalled();
  });

  it("uses native clipboard image read when destination is native", async () => {
    readNativeClipboardImagePathMock.mockResolvedValue("C:\\Temp\\clipboard-paste\\clip.png");

    await expect(
      readClipboardImagePaths({ destination: "native" }),
    ).resolves.toEqual(["C:\\Temp\\clipboard-paste\\clip.png"]);
    expect(readNativeClipboardImagePathMock).toHaveBeenCalledTimes(1);
    expect(readComposerClipboardImagePathMock).not.toHaveBeenCalled();
  });

  it("returns empty array when both dom and tauri reads fail", async () => {
    readComposerClipboardImagePathMock.mockResolvedValue(null);

    await expect(readClipboardImagePaths()).resolves.toEqual([]);
  });
});
