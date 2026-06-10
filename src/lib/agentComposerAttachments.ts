import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

const MEDIA_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "mp4",
  "mov",
  "webm",
  "mkv",
  "avi",
] as const;

const MEDIA_EXTENSION_SET = new Set<string>(MEDIA_EXTENSIONS);

const IMAGE_MIME_TO_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
};

export function attachmentDisplayName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function extensionFromImageMimeType(mimeType: string): string | null {
  const normalized = mimeType.trim().toLowerCase();
  return IMAGE_MIME_TO_EXTENSION[normalized] ?? null;
}

export function isMediaAttachmentPath(path: string): boolean {
  const fileName = path.split(/[/\\]/).pop() ?? "";
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = fileName.slice(dot + 1).toLowerCase();
  return MEDIA_EXTENSION_SET.has(ext);
}

export async function saveClipboardImageAttachment(file: File): Promise<string | null> {
  const extension = extensionFromImageMimeType(file.type);
  if (!extension) return null;

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) return null;

  try {
    return await invoke<string>("fs_write_temp_attachment", {
      data: Array.from(bytes),
      extension,
    });
  } catch {
    return null;
  }
}

export async function extractClipboardImagePaths(
  clipboard: DataTransfer | null,
): Promise<string[]> {
  if (!clipboard) return [];

  const paths: string[] = [];
  for (const item of clipboard.items) {
    if (!item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (!file) continue;
    const path = await saveClipboardImageAttachment(file);
    if (path && isMediaAttachmentPath(path)) {
      paths.push(path);
    }
  }
  return paths;
}

export async function pickMediaAttachmentPaths(): Promise<string[]> {
  const selected = await open({
    multiple: true,
    filters: [{ name: "Media", extensions: [...MEDIA_EXTENSIONS] }],
  });
  if (!selected) return [];
  const paths = Array.isArray(selected) ? selected : [selected];
  return paths.filter(isMediaAttachmentPath);
}

export function formatAgentComposerMessage(text: string, paths: string[]): string {
  const trimmed = text.trim();
  const validPaths = paths.map((path) => path.trim()).filter(Boolean);
  if (!trimmed && validPaths.length === 0) return "";
  if (!trimmed) return validPaths.join("\n");
  if (validPaths.length === 0) return trimmed;
  return `${trimmed}\n${validPaths.join("\n")}`;
}
