import { describe, expect, it } from "vitest";
import {
  UPDATER_ENDPOINT_CUDA,
  UPDATER_ENDPOINT_DEFAULT,
  UPDATER_ENDPOINT_OPENBLAS,
  UPDATER_MANIFEST_CUDA,
  UPDATER_MANIFEST_DEFAULT,
  UPDATER_MANIFEST_OPENBLAS,
  updaterEndpointForBackend,
  updaterEndpointForManifest,
  usesAlternateUpdaterChannel,
} from "./updater-manifest.mjs";

describe("updater-manifest", () => {
  it("maps default manifest to default endpoint", () => {
    expect(updaterEndpointForManifest(UPDATER_MANIFEST_DEFAULT)).toBe(UPDATER_ENDPOINT_DEFAULT);
  });

  it("maps alternate manifests to their endpoints", () => {
    expect(updaterEndpointForManifest(UPDATER_MANIFEST_CUDA)).toBe(UPDATER_ENDPOINT_CUDA);
    expect(updaterEndpointForManifest(UPDATER_MANIFEST_OPENBLAS)).toBe(UPDATER_ENDPOINT_OPENBLAS);
  });

  it("routes backend builds to the correct channel", () => {
    expect(updaterEndpointForBackend("cuda")).toBe(UPDATER_ENDPOINT_CUDA);
    expect(updaterEndpointForBackend("openblas")).toBe(UPDATER_ENDPOINT_OPENBLAS);
    expect(updaterEndpointForBackend("vulkan")).toBe(UPDATER_ENDPOINT_DEFAULT);
    expect(updaterEndpointForBackend("metal")).toBe(UPDATER_ENDPOINT_DEFAULT);
  });

  it("detects alternate updater channels", () => {
    expect(usesAlternateUpdaterChannel("cuda")).toBe(true);
    expect(usesAlternateUpdaterChannel("openblas")).toBe(true);
    expect(usesAlternateUpdaterChannel("vulkan")).toBe(false);
  });
});
