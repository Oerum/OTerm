import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  readImage as tauriReadClipboardImage,
  readText as tauriReadClipboardText,
  writeText as tauriWriteClipboardText,
} from "@tauri-apps/plugin-clipboard-manager";

export type ClipboardImageDestination = "composer" | "native";

export type GeminiClipboardImageResult = {
  absolutePath: string;
  promptReference: string;
};

function ensureTauriClipboardRuntime() {
  if (!isTauri()) {
    throw new Error("Clipboard access is only available in the desktop app runtime.");
  }
}

export async function readClipboardText(): Promise<string> {
  ensureTauriClipboardRuntime();
  return tauriReadClipboardText();
}

export async function writeClipboardText(text: string): Promise<void> {
  ensureTauriClipboardRuntime();
  await tauriWriteClipboardText(text);
}

export async function clipboardHasImage(): Promise<boolean> {
  if (!isTauri()) return false;

  try {
    const image = await tauriReadClipboardImage();
    const size = await image.size();
    return size.width > 0 && size.height > 0;
  } catch {
    return false;
  }
}

async function getClipboardImageRgba(): Promise<{ data: number[]; width: number; height: number } | null> {
  if (!isTauri()) return null;
  try {
    const image = await tauriReadClipboardImage();
    const [rgba, size] = await Promise.all([image.rgba(), image.size()]);
    if (rgba.length === 0 || size.width <= 0 || size.height <= 0) return null;
    return { data: Array.from(rgba), width: size.width, height: size.height };
  } catch {
    return null;
  }
}

async function readClipboardImagePath(
  destination: ClipboardImageDestination,
): Promise<string | null> {
  const payload = await getClipboardImageRgba();
  if (!payload) return null;

  const command =
    destination === "composer"
      ? "fs_write_temp_attachment_rgba"
      : "fs_write_temp_clipboard_paste_rgba";

  try {
    return await invoke<string>(command, payload);
  } catch {
    return null;
  }
}

export async function readComposerClipboardImagePath(): Promise<string | null> {
  return readClipboardImagePath("composer");
}

export async function readNativeClipboardImagePath(): Promise<string | null> {
  return readClipboardImagePath("native");
}

/** Composer attachment flows only. */
export async function readClipboardImageAttachmentPath(): Promise<string | null> {
  return readComposerClipboardImagePath();
}

export function clipboardDataHasImage(clipboardData: DataTransfer | null | undefined): boolean {
  if (!clipboardData) return false;
  for (const item of clipboardData.items) {
    if (item.type.startsWith("image/")) return true;
  }
  return false;
}

export async function clipboardHasPasteableImage(
  clipboardData?: DataTransfer | null,
): Promise<boolean> {
  if (clipboardDataHasImage(clipboardData ?? null)) return true;
  return clipboardHasImage();
}

export async function saveGeminiClipboardImage(
  projectRoot: string,
): Promise<GeminiClipboardImageResult | null> {
  const payload = await getClipboardImageRgba();
  if (!payload) return null;

  try {
    return await invoke<GeminiClipboardImageResult>("fs_save_gemini_clipboard_image_rgba", {
      ...payload,
      projectRoot,
    });
  } catch {
    return null;
  }
}
