import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./fsTransferApi";
import { parseSftpTransferSettings } from "./sshSftpSettings";
import {
  DEFAULT_SFTP_MAX_FILE_BYTES,
  DEFAULT_SFTP_PARALLEL_FILES,
  MAX_SFTP_PARALLEL_FILES,
} from "../types/sshSftpSettings";

describe("parseSftpTransferSettings", () => {
  it("clamps parallel files to 1–1000", () => {
    expect(parseSftpTransferSettings(JSON.stringify({ parallelFiles: 0 })).parallelFiles).toBe(1);
    expect(parseSftpTransferSettings(JSON.stringify({ parallelFiles: 2000 })).parallelFiles).toBe(
      MAX_SFTP_PARALLEL_FILES,
    );
    expect(parseSftpTransferSettings(JSON.stringify({ parallelFiles: 15 })).parallelFiles).toBe(15);
  });

  it("defaults invalid max file size to 500 MB", () => {
    expect(
      parseSftpTransferSettings(JSON.stringify({ maxFileSizeBytes: 0 })).maxFileSizeBytes,
    ).toBe(DEFAULT_SFTP_MAX_FILE_BYTES);
    expect(
      parseSftpTransferSettings(JSON.stringify({ maxFileSizeBytes: -1 })).maxFileSizeBytes,
    ).toBe(DEFAULT_SFTP_MAX_FILE_BYTES);
  });

  it("preserves valid max file size", () => {
    const bytes = 1024 * 1024 * 1024;
    expect(
      parseSftpTransferSettings(JSON.stringify({ maxFileSizeBytes: bytes })).maxFileSizeBytes,
    ).toBe(bytes);
  });

  it("uses defaults for empty object", () => {
    const parsed = parseSftpTransferSettings("{}");
    expect(parsed.parallelFiles).toBe(DEFAULT_SFTP_PARALLEL_FILES);
    expect(parsed.maxFileSizeBytes).toBe(DEFAULT_SFTP_MAX_FILE_BYTES);
  });
});

describe("mapWithConcurrency", () => {
  it("respects concurrency limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const run = mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gate;
      inFlight -= 1;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(maxInFlight).toBe(2);
    release();
    await run;
  });

  it("counts failures without aborting the batch", async () => {
    const items = [1, 2, 3, 4];
    const { failures } = await mapWithConcurrency(items, 2, async (value) => {
      if (value % 2 === 0) throw new Error("fail");
    });
    expect(failures).toBe(2);
  });

  it("returns zero failures for empty input", async () => {
    const { failures } = await mapWithConcurrency([], 5, async () => {});
    expect(failures).toBe(0);
  });
});
