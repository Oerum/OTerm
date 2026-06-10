import { createDir, readFile, removePath, writeFile } from "./fsApi";

export function joinPath(base: string, name: string): string {
  const normalized = base.replace(/[/\\]+$/, "");
  if (!normalized) return name;
  const sep = base.includes("\\") ? "\\" : "/";
  return `${normalized}${sep}${name}`;
}

export function parentPath(path: string): string {
  if (!path || path === "." || /^[A-Za-z]:\\?$/.test(path)) return path;
  const sep = path.includes("\\") ? "\\" : "/";
  const parts = path.split(/[/\\]/).filter(Boolean);
  if (parts.length <= 1) {
    if (/^[A-Za-z]:/.test(path)) return `${path.slice(0, 2)}\\`;
    return sep === "/" ? "/" : ".";
  }
  parts.pop();
  if (/^[A-Za-z]:/.test(path)) {
    return `${path.slice(0, 2)}\\${parts.join("\\")}`;
  }
  return `${sep}${parts.join(sep)}`;
}

export async function transferLocalToRemote(
  localPath: string,
  upload: (remotePath: string, data: Uint8Array) => Promise<void>,
  remoteDir: string,
  fileName: string,
): Promise<void> {
  const data = await readFile(localPath);
  await upload(joinPath(remoteDir, fileName), data);
}

export async function transferRemoteToLocal(
  download: (remotePath: string) => Promise<Uint8Array>,
  remotePath: string,
  localDir: string,
  fileName: string,
): Promise<void> {
  const data = await download(remotePath);
  await writeFile(joinPath(localDir, fileName), data);
}

export { createDir, readFile, removePath, writeFile };
