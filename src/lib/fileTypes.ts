export type FileType = "dir" | "archive" | "media" | "code" | "file";

// Fast string slicing avoids O(N) array allocation from .split('.')
function getFileExtension(name: string): string {
  const lastDotIndex = name.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === name.length - 1) {
    return "";
  }
  return name.slice(lastDotIndex + 1).toLowerCase();
}

// O(1) Set lookups are faster than O(N) Array.includes() for hot path file type checking
const ARCHIVE_EXTS = new Set(["zip", "tar", "gz", "tgz", "rar", "7z", "bz2", "xz"]);
const MEDIA_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "mp4", "mkv", "mov", "avi"]);
const CODE_EXTS = new Set([
  "js", "ts", "json", "py", "rs", "go", "c", "cpp", "h", "cs", "java", "sh", "bat", "ps1", "html", "css", "yaml", "yml", "toml", "md", "vue"
]);

export function getFileType(name: string, isDir: boolean): FileType {
  if (isDir) return "dir";
  const ext = getFileExtension(name);
  if (!ext) return "file";

  if (ARCHIVE_EXTS.has(ext)) return "archive";
  if (MEDIA_EXTS.has(ext)) return "media";
  if (CODE_EXTS.has(ext)) return "code";

  return "file";
}
