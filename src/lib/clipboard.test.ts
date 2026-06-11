import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, isTauriMock, readImageMock, readTextMock, writeTextMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args: any) => Promise<any>>(),
  isTauriMock: vi.fn<() => boolean>(),
  readImageMock: vi.fn<
    () => Promise<{
      rgba: () => Promise<Uint8Array>;
      size: () => Promise<{ width: number; height: number }>;
    }>
  >(),
  readTextMock: vi.fn<() => Promise<string>>(),
  writeTextMock: vi.fn<(text: string) => Promise<void>>(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readImage: readImageMock,
  readText: readTextMock,
  writeText: writeTextMock,
}));

import {
  clipboardDataHasImage,
  clipboardHasImage,
  clipboardHasPasteableImage,
  readClipboardImageAttachmentPath,
  readComposerClipboardImagePath,
  readNativeClipboardImagePath,
  readClipboardText,
  saveGeminiClipboardImage,
  writeClipboardText,
} from "./clipboard";

describe("clipboard", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    isTauriMock.mockReset();
    readImageMock.mockReset();
    readTextMock.mockReset();
    writeTextMock.mockReset();
  });

  it("reads clipboard text through the tauri plugin", async () => {
    isTauriMock.mockReturnValue(true);
    readTextMock.mockResolvedValue("hello");

    await expect(readClipboardText()).resolves.toBe("hello");
    expect(readTextMock).toHaveBeenCalledTimes(1);
  });

  it("writes clipboard text through the tauri plugin", async () => {
    isTauriMock.mockReturnValue(true);
    writeTextMock.mockResolvedValue();

    await expect(writeClipboardText("payload")).resolves.toBeUndefined();
    expect(writeTextMock).toHaveBeenCalledWith("payload");
  });

  it("rejects clipboard reads outside tauri runtime", async () => {
    isTauriMock.mockReturnValue(false);

    await expect(readClipboardText()).rejects.toThrow(
      "Clipboard access is only available in the desktop app runtime.",
    );
    expect(readTextMock).not.toHaveBeenCalled();
  });

  it("rejects clipboard writes outside tauri runtime", async () => {
    isTauriMock.mockReturnValue(false);

    await expect(writeClipboardText("payload")).rejects.toThrow(
      "Clipboard access is only available in the desktop app runtime.",
    );
    expect(writeTextMock).not.toHaveBeenCalled();
  });

  it("returns null for composer clipboard image reads outside tauri runtime", async () => {
    isTauriMock.mockReturnValue(false);

    await expect(readComposerClipboardImagePath()).resolves.toBeNull();
    await expect(readClipboardImageAttachmentPath()).resolves.toBeNull();
    expect(readImageMock).not.toHaveBeenCalled();
  });

  it("returns null for native clipboard image reads outside tauri runtime", async () => {
    isTauriMock.mockReturnValue(false);

    await expect(readNativeClipboardImagePath()).resolves.toBeNull();
    expect(readImageMock).not.toHaveBeenCalled();
  });

  it("writes composer clipboard images through the attachment rgba encoder", async () => {
    isTauriMock.mockReturnValue(true);
    readImageMock.mockResolvedValue({
      rgba: async () => new Uint8Array([255, 0, 0, 255]),
      size: async () => ({ width: 1, height: 1 }),
    });
    invokeMock.mockResolvedValue("C:\\Temp\\composer-attachments\\clip.png");

    await expect(readComposerClipboardImagePath()).resolves.toBe(
      "C:\\Temp\\composer-attachments\\clip.png",
    );
    expect(invokeMock).toHaveBeenCalledWith("fs_write_temp_attachment_rgba", {
      data: [255, 0, 0, 255],
      width: 1,
      height: 1,
    });
  });

  it("writes native clipboard images through the clipboard-paste rgba encoder", async () => {
    isTauriMock.mockReturnValue(true);
    readImageMock.mockResolvedValue({
      rgba: async () => new Uint8Array([255, 0, 0, 255]),
      size: async () => ({ width: 1, height: 1 }),
    });
    invokeMock.mockResolvedValue("C:\\Temp\\clipboard-paste\\clip.png");

    await expect(readNativeClipboardImagePath()).resolves.toBe(
      "C:\\Temp\\clipboard-paste\\clip.png",
    );
    expect(invokeMock).toHaveBeenCalledWith("fs_write_temp_clipboard_paste_rgba", {
      data: [255, 0, 0, 255],
      width: 1,
      height: 1,
    });
  });

  it("returns null when clipboard image read fails", async () => {
    isTauriMock.mockReturnValue(true);
    readImageMock.mockRejectedValue(new Error("no image"));

    await expect(readNativeClipboardImagePath()).resolves.toBeNull();
  });

  it("detects when the clipboard contains an image", async () => {
    isTauriMock.mockReturnValue(true);
    readImageMock.mockResolvedValue({
      rgba: async () => new Uint8Array([255, 0, 0, 255]),
      size: async () => ({ width: 2, height: 2 }),
    });

    await expect(clipboardHasImage()).resolves.toBe(true);
  });

  it("returns false when clipboard image detection fails", async () => {
    isTauriMock.mockReturnValue(true);
    readImageMock.mockRejectedValue(new Error("no image"));

    await expect(clipboardHasImage()).resolves.toBe(false);
  });

  it("detects images from clipboard event data before tauri", async () => {
    const clipboardData = {
      items: [{ type: "image/png", getAsFile: () => null }],
    } as unknown as DataTransfer;

    await expect(clipboardHasPasteableImage(clipboardData)).resolves.toBe(true);
    expect(readImageMock).not.toHaveBeenCalled();
  });

  it("saves gemini clipboard images under the gemini tmp images directory", async () => {
    isTauriMock.mockReturnValue(true);
    readImageMock.mockResolvedValue({
      rgba: async () => new Uint8Array([255, 0, 0, 255]),
      size: async () => ({ width: 1, height: 1 }),
    });
    invokeMock.mockResolvedValue({
      absolutePath: "C:\\Users\\Filip\\.gemini\\tmp\\filip\\images\\clipboard-1.png",
      promptReference: "@.gemini\\tmp\\filip\\images\\clipboard-1.png ",
    });

    await expect(saveGeminiClipboardImage("C:\\Users\\Filip")).resolves.toEqual({
      absolutePath: "C:\\Users\\Filip\\.gemini\\tmp\\filip\\images\\clipboard-1.png",
      promptReference: "@.gemini\\tmp\\filip\\images\\clipboard-1.png ",
    });
    expect(invokeMock).toHaveBeenCalledWith("fs_save_gemini_clipboard_image_rgba", {
      data: [255, 0, 0, 255],
      width: 1,
      height: 1,
      projectRoot: "C:\\Users\\Filip",
    });
  });

  it("reports clipboard data image items", () => {
    const clipboardData = {
      items: [{ type: "text/plain", getAsFile: () => null }],
    } as unknown as DataTransfer;
    expect(clipboardDataHasImage(clipboardData)).toBe(false);

    const withImage = {
      items: [{ type: "image/png", getAsFile: () => null }],
    } as unknown as DataTransfer;
    expect(clipboardDataHasImage(withImage)).toBe(true);
  });
});
