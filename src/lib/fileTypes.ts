export type FileType = "dir" | "archive" | "media" | "code" | "file";

function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1]!.toLowerCase() : "";
}

export function getFileType(name: string, isDir: boolean): FileType {
  if (isDir) return "dir";
  const ext = getFileExtension(name);
  if (["zip", "tar", "gz", "tgz", "rar", "7z", "bz2", "xz"].includes(ext)) {
    return "archive";
  }
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "mp4", "mkv", "mov", "avi"].includes(ext)) {
    return "media";
  }
  if (
    [
      "js",
      "ts",
      "json",
      "py",
      "rs",
      "go",
      "c",
      "cpp",
      "h",
      "cs",
      "java",
      "sh",
      "bat",
      "ps1",
      "html",
      "css",
      "yaml",
      "yml",
      "toml",
      "md",
      "vue",
    ].includes(ext)
  ) {
    return "code";
  }
  return "file";
}
