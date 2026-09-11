import { describe, expect, it, vi } from "vitest";
import {
  collectRemoteDownloadTree,
  isSafePathSegment,
  joinPath,
  parentPath,
  transferRemoteToLocal,
} from "./fsTransferApi";
import { writeFile } from "./fsApi";

vi.mock("./fsApi", () => ({
  createDir: vi.fn().mockResolvedValue(undefined),
  listDirectory: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  removePath: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe("isSafePathSegment", () => {
  it("accepts valid filenames and dotfiles", () => {
    expect(isSafePathSegment("file.txt")).toBe(true);
    expect(isSafePathSegment(".gitignore")).toBe(true);
    expect(isSafePathSegment(".env.local")).toBe(true);
    expect(isSafePathSegment("my-archive.tar.gz")).toBe(true);
    expect(isSafePathSegment("document (copy) 1.pdf")).toBe(true);
    expect(isSafePathSegment("folder_name")).toBe(true);
  });

  it("rejects path traversal navigation (. and .. and ...)", () => {
    expect(isSafePathSegment(".")).toBe(false);
    expect(isSafePathSegment("..")).toBe(false);
    expect(isSafePathSegment("...")).toBe(false);
    expect(isSafePathSegment(" .. ")).toBe(false);
  });

  it("rejects directory separators (/ and \\)", () => {
    expect(isSafePathSegment("../evil.sh")).toBe(false);
    expect(isSafePathSegment("..\\evil.sh")).toBe(false);
    expect(isSafePathSegment("folder/file.txt")).toBe(false);
    expect(isSafePathSegment("folder\\file.txt")).toBe(false);
    expect(isSafePathSegment("/etc/passwd")).toBe(false);
    expect(isSafePathSegment("\\Windows\\System32")).toBe(false);
  });

  it("rejects Windows colons (drive letters and ADS)", () => {
    expect(isSafePathSegment("C:foo")).toBe(false);
    expect(isSafePathSegment("file.txt:stream")).toBe(false);
  });

  it("rejects empty, whitespace, and control characters", () => {
    expect(isSafePathSegment("")).toBe(false);
    expect(isSafePathSegment("   ")).toBe(false);
    expect(isSafePathSegment("file\0.txt")).toBe(false);
    expect(isSafePathSegment("file\n.txt")).toBe(false);
    expect(isSafePathSegment(null as unknown as string)).toBe(false);
  });
});

describe("joinPath and parentPath", () => {
  it("joins paths cleanly", () => {
    expect(joinPath("/home/user", "file.txt")).toBe("/home/user/file.txt");
    expect(joinPath("C:\\Users\\user", "file.txt")).toBe("C:\\Users\\user\\file.txt");
  });

  it("computes parent path", () => {
    expect(parentPath("/home/user/file.txt")).toBe("/home/user");
    expect(parentPath("C:\\Users\\user\\file.txt")).toBe("C:\\Users\\user");
    expect(parentPath("C:\\file.txt")).toBe("C:\\");
    expect(parentPath("C:\\")).toBe("C:\\");
    expect(parentPath("/file.txt")).toBe("/");
    expect(parentPath("/")).toBe("/");
    expect(parentPath("foo/bar/baz")).toBe("foo/bar");
    expect(parentPath("foo")).toBe(".");
  });
});

describe("transferRemoteToLocal", () => {
  it("downloads and writes file when filename is safe", async () => {
    const mockDownload = vi.fn().mockResolvedValue(new Uint8Array([4, 5, 6]));
    await transferRemoteToLocal(mockDownload, "/remote/path/doc.txt", "/local/dir", "doc.txt");

    expect(mockDownload).toHaveBeenCalledWith("/remote/path/doc.txt");
    expect(writeFile).toHaveBeenCalledWith("/local/dir/doc.txt", new Uint8Array([4, 5, 6]));
  });

  it("throws and does not download or write when filename is malicious traversal", async () => {
    const mockDownload = vi.fn().mockResolvedValue(new Uint8Array([4, 5, 6]));

    await expect(
      transferRemoteToLocal(mockDownload, "/remote/evil", "/local/dir", "../../etc/passwd"),
    ).rejects.toThrow("Invalid transfer file name");

    expect(mockDownload).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalledWith(
      expect.stringContaining("etc/passwd"),
      expect.anything(),
    );
  });
});

describe("collectRemoteDownloadTree", () => {
  it("throws when root folderName is unsafe", async () => {
    const mockList = vi.fn();
    await expect(
      collectRemoteDownloadTree(mockList, "/remote/dir", "/local/parent", "../evil"),
    ).rejects.toThrow("Invalid folder name");
  });

  it("skips . and .. entries from remote listing and collects valid files", async () => {
    const mockList = vi.fn().mockResolvedValue([
      { path: "/remote/dir/.", name: ".", isDir: true },
      { path: "/remote/dir/..", name: "..", isDir: true },
      { path: "/remote/dir/hello.txt", name: "hello.txt", isDir: false },
    ]);

    const result = await collectRemoteDownloadTree(
      mockList,
      "/remote/dir",
      "/local/parent",
      "target_dir",
    );

    expect(result.localDirs).toEqual(["/local/parent/target_dir"]);
    expect(result.files).toEqual([
      {
        remotePath: "/remote/dir/hello.txt",
        localPath: "/local/parent/target_dir/hello.txt",
      },
    ]);
  });

  it("throws when remote entry has traversal name", async () => {
    const mockList = vi.fn().mockResolvedValue([
      { path: "/remote/dir/evil.sh", name: "../../evil.sh", isDir: false },
    ]);

    await expect(
      collectRemoteDownloadTree(mockList, "/remote/dir", "/local/parent", "target_dir"),
    ).rejects.toThrow("Invalid remote entry name");
  });
});
