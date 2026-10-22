import type { GitFileEntry } from "../types/git";

export type SourceControlTreeFolderRow = {
  kind: "folder";
  key: string;
  path: string;
  name: string;
  depth: number;
  collapsed: boolean;
  filePaths: string[];
};

export type SourceControlTreeFileRow = {
  kind: "file";
  key: string;
  entry: GitFileEntry;
  fileName: string;
  dirPath: string;
  depth: number;
};

export type SourceControlTreeRow = SourceControlTreeFolderRow | SourceControlTreeFileRow;

interface RawFolderNode {
  name: string;
  path: string;
  folders: Map<string, RawFolderNode>;
  files: Array<{ entry: GitFileEntry; fileName: string; dirPath: string }>;
  filePaths: string[];
}

const baseCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const variantCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "variant" });

export function normalizeGitPath(path: string): string {
  const s = path.includes("\\") ? path.replace(/\\/g, "/") : path;
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) === 47) start++;
  while (end > start && s.charCodeAt(end - 1) === 47) end--;
  return start === 0 && end === s.length ? s : s.slice(start, end);
}

export function parseFilePath(path: string) {
  const normalized = normalizeGitPath(path);
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) {
    return { fileName: normalized, dirPath: "" };
  }
  return {
    fileName: normalized.slice(lastSlash + 1),
    dirPath: normalized.slice(0, lastSlash),
  };
}

function compareNames(a: string, b: string): number {
  if (a === b) return 0;
  const cmp = baseCollator.compare(a, b);
  return cmp !== 0 ? cmp : variantCollator.compare(a, b);
}

function splitPathSegments(path: string): string[] {
  const norm = normalizeGitPath(path);
  if (!norm) return [];
  return norm.includes("//") ? norm.split("/").filter(Boolean) : norm.split("/");
}

function compareSegments(aParts: readonly string[], bParts: readonly string[]): number {
  const minLen = Math.min(aParts.length, bParts.length);

  for (let i = 0; i < minLen; i++) {
    const aIsDir = i < aParts.length - 1;
    const bIsDir = i < bParts.length - 1;
    if (aIsDir !== bIsDir) {
      return aIsDir ? -1 : 1;
    }
    const cmp = compareNames(aParts[i], bParts[i]);
    if (cmp !== 0) return cmp;
  }

  return aParts.length - bParts.length;
}

export function compareGitPaths(a: string, b: string): number {
  if (a === b) return 0;
  return compareSegments(splitPathSegments(a), splitPathSegments(b));
}

export function sortGitFileEntriesByPath<T extends { path: string }>(entries: readonly T[]): T[] {
  if (entries.length <= 1) return entries.slice();
  return entries
    .map((entry) => ({ entry, parts: splitPathSegments(entry.path) }))
    .sort((a, b) => compareSegments(a.parts, b.parts))
    .map((item) => item.entry);
}

export function filterGitFileEntries<T extends { path: string }>(
  entries: readonly T[],
  query: string,
): readonly T[] {
  const q = normalizeGitPath(query.trim()).toLowerCase();
  if (!q || entries.length === 0) return entries;

  const result: T[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (normalizeGitPath(entry.path).toLowerCase().includes(q)) {
      result.push(entry);
    }
  }
  return result;
}

function compactFolder(node: RawFolderNode): RawFolderNode {
  let current = node;
  while (current.folders.size === 1 && current.files.length === 0) {
    const child = current.folders.values().next().value!;
    current = {
      name: `${current.name}/${child.name}`,
      path: child.path,
      folders: child.folders,
      files: child.files,
      filePaths: child.filePaths,
    };
  }
  return current;
}

function insertTreeEntry(root: RawFolderNode, entry: GitFileEntry, parts: readonly string[]) {
  if (parts.length === 0) return;

  if (parts.length === 1) {
    root.files.push({ entry, fileName: parts[0], dirPath: "" });
    return;
  }

  let current = root;
  let currentPath = "";
  for (let d = 0; d < parts.length - 1; d++) {
    const seg = parts[d];
    currentPath = currentPath ? `${currentPath}/${seg}` : seg;
    let folder = current.folders.get(seg);
    if (!folder) {
      folder = {
        name: seg,
        path: currentPath,
        folders: new Map(),
        files: [],
        filePaths: [],
      };
      current.folders.set(seg, folder);
    }
    folder.filePaths.push(entry.path);
    current = folder;
  }

  current.files.push({
    entry,
    fileName: parts[parts.length - 1],
    dirPath: currentPath,
  });
}

export function buildSourceControlTreeRows(
  entries: readonly GitFileEntry[],
  collapsedFolders?: ReadonlySet<string>,
  preSorted = false,
): SourceControlTreeRow[] {
  if (entries.length === 0) return [];

  const root: RawFolderNode = {
    name: "",
    path: "",
    folders: new Map(),
    files: [],
    filePaths: [],
  };

  if (preSorted || entries.length === 1) {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      insertTreeEntry(root, entry, splitPathSegments(entry.path));
    }
  } else {
    const decorated = entries
      .map((entry) => ({ entry, parts: splitPathSegments(entry.path) }))
      .sort((a, b) => compareSegments(a.parts, b.parts));

    for (let i = 0; i < decorated.length; i++) {
      const { entry, parts } = decorated[i];
      insertTreeEntry(root, entry, parts);
    }
  }

  const rows: SourceControlTreeRow[] = [];

  function visit(node: RawFolderNode, depth: number) {
    for (const rawFolder of node.folders.values()) {
      const folder = compactFolder(rawFolder);
      const collapsed = collapsedFolders?.has(folder.path) ?? false;
      rows.push({
        kind: "folder",
        key: `folder:${folder.path}`,
        path: folder.path,
        name: folder.name,
        depth,
        collapsed,
        filePaths: folder.filePaths,
      });
      if (!collapsed) {
        visit(folder, depth + 1);
      }
    }

    for (let i = 0; i < node.files.length; i++) {
      const f = node.files[i];
      rows.push({
        kind: "file",
        key: `file:${f.entry.path}`,
        entry: f.entry,
        fileName: f.fileName,
        dirPath: f.dirPath,
        depth,
      });
    }
  }

  visit(root, 0);
  return rows;
}

export function collectSourceControlFolderPaths(
  entries: readonly GitFileEntry[],
  preSorted = false,
): Set<string> {
  const rows = buildSourceControlTreeRows(entries, undefined, preSorted);
  const paths = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.kind === "folder") {
      paths.add(row.path);
    }
  }
  return paths;
}
