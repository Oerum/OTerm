import { createDir, listDirectory, readFile, removePath, writeFile } from "./fsApi";

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

function assertWithinMaxFileSize(
  size: number,
  maxFileSizeBytes: number,
  label: string,
): void {
  if (size > maxFileSizeBytes) {
    throw new Error(
      `"${label}" exceeds the ${maxFileSizeBytes} byte SFTP transfer limit (${size} bytes)`,
    );
  }
}

export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<{ failures: number }> {
  if (items.length === 0) return { failures: 0 };

  const cap = Math.max(1, Math.min(limit, items.length));
  let index = 0;
  let failures = 0;

  async function runWorker() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      try {
        await worker(items[current]!);
      } catch {
        failures += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: cap }, () => runWorker()));
  return { failures };
}

export type LocalFileUploadJob = {
  localPath: string;
  remotePath: string;
};

export type RemoteFileDownloadJob = {
  remotePath: string;
  localPath: string;
};

export async function collectLocalUploadTree(
  localPath: string,
  remoteParentDir: string,
  folderName: string,
): Promise<{ remoteDirs: string[]; files: LocalFileUploadJob[] }> {
  const remoteDirPath = joinPath(remoteParentDir === "." ? "" : remoteParentDir, folderName);
  const remoteDirs = [remoteDirPath];
  const files: LocalFileUploadJob[] = [];
  const localEntries = await listDirectory(localPath);
  for (const entry of localEntries) {
    if (entry.isDir) {
      const nested = await collectLocalUploadTree(entry.path, remoteDirPath, entry.name);
      remoteDirs.push(...nested.remoteDirs);
      files.push(...nested.files);
    } else {
      files.push({
        localPath: entry.path,
        remotePath: joinPath(remoteDirPath, entry.name),
      });
    }
  }
  return { remoteDirs, files };
}

export async function collectRemoteDownloadTree(
  listRemoteDir: (path: string) => Promise<{ path: string; name: string; isDir: boolean }[]>,
  remotePath: string,
  localParentDir: string,
  folderName: string,
): Promise<{ localDirs: string[]; files: RemoteFileDownloadJob[] }> {
  const localDirPath = joinPath(localParentDir, folderName);
  const localDirs = [localDirPath];
  const files: RemoteFileDownloadJob[] = [];
  const remoteEntries = await listRemoteDir(remotePath);
  for (const entry of remoteEntries) {
    if (entry.isDir) {
      const nested = await collectRemoteDownloadTree(
        listRemoteDir,
        entry.path,
        localDirPath,
        entry.name,
      );
      localDirs.push(...nested.localDirs);
      files.push(...nested.files);
    } else {
      files.push({
        remotePath: entry.path,
        localPath: joinPath(localDirPath, entry.name),
      });
    }
  }
  return { localDirs, files };
}

export async function transferLocalToRemote(
  localPath: string,
  upload: (remotePath: string, data: Uint8Array) => Promise<void>,
  remoteDir: string,
  fileName: string,
  maxFileSizeBytes: number,
): Promise<void> {
  const parent = parentPath(localPath);
  const entries = await listDirectory(parent);
  const entry = entries.find((item) => item.path === localPath || item.name === fileName);
  if (entry?.size != null) {
    assertWithinMaxFileSize(entry.size, maxFileSizeBytes, fileName);
  }
  const data = await readFile(localPath);
  assertWithinMaxFileSize(data.length, maxFileSizeBytes, fileName);
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

export async function transferLocalJobToRemote(
  job: LocalFileUploadJob,
  upload: (remotePath: string, data: Uint8Array) => Promise<void>,
  maxFileSizeBytes: number,
): Promise<void> {
  const name = job.localPath.split(/[/\\]/).pop() ?? job.remotePath;
  const parent = parentPath(job.localPath);
  const entries = await listDirectory(parent);
  const entry = entries.find((item) => item.path === job.localPath);
  if (entry?.size != null) {
    assertWithinMaxFileSize(entry.size, maxFileSizeBytes, name);
  }
  const data = await readFile(job.localPath);
  assertWithinMaxFileSize(data.length, maxFileSizeBytes, name);
  await upload(job.remotePath, data);
}

export async function transferRemoteJobToLocal(
  job: RemoteFileDownloadJob,
  download: (remotePath: string) => Promise<Uint8Array>,
): Promise<void> {
  const data = await download(job.remotePath);
  await writeFile(job.localPath, data);
}

export { createDir, readFile, removePath, writeFile };
