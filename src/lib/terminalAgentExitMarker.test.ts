import { describe, expect, it } from "vitest";
import {
  buildAgentExitMarkerSuffix,
  formatAgentExitMarker,
  parseAgentExitMarkers,
  processAgentExitMarkerChunk,
  splitAgentExitMarkerCarry,
  stripAgentExitMarkers,
  supportsAgentExitMarker,
} from "./terminalAgentExitMarker";

describe("buildAgentExitMarkerSuffix", () => {
  it("builds unix-style suffixes", () => {
    expect(buildAgentExitMarkerSuffix("bash")).toContain("printf");
    expect(buildAgentExitMarkerSuffix("zsh")).toContain("$?");
    expect(buildAgentExitMarkerSuffix("fish")).toContain("$status");
  });

  it("builds PowerShell suffixes", () => {
    expect(buildAgentExitMarkerSuffix("pwsh")).toContain("$LASTEXITCODE");
    expect(buildAgentExitMarkerSuffix("powershell")).toContain("Write-Host");
  });

  it("returns null for unsupported shells", () => {
    expect(buildAgentExitMarkerSuffix("cmd")).toBeNull();
    expect(supportsAgentExitMarker("cmd")).toBe(false);
  });
});

describe("parseAgentExitMarkers", () => {
  it("parses one or more markers in a chunk", () => {
    const marker0 = formatAgentExitMarker(0);
    const marker2 = formatAgentExitMarker(2);
    const data = `done${marker0}tail${marker2}`;
    expect(parseAgentExitMarkers(data)).toEqual([
      { exitCode: 0 },
      { exitCode: 2 },
    ]);
  });

  it("strips markers without touching surrounding output", () => {
    const marker = formatAgentExitMarker(137);
    const data = `before${marker}after`;
    expect(stripAgentExitMarkers(data)).toBe("beforeafter");
  });
});

describe("splitAgentExitMarkerCarry", () => {
  it("holds incomplete marker prefixes across chunks", () => {
    const marker = formatAgentExitMarker(9);
    const splitAt = marker.indexOf("code=9");
    const first = `output${marker.slice(0, splitAt)}`;
    const second = `${marker.slice(splitAt)}done`;

    const firstPass = splitAgentExitMarkerCarry(first);
    expect(firstPass.processable).toBe("output");
    expect(firstPass.carry.length).toBeGreaterThan(0);

    const secondPass = processAgentExitMarkerChunk(firstPass.carry, second);
    expect(secondPass.markers).toEqual([{ exitCode: 9 }]);
    expect(secondPass.stripped).toBe("done");
    expect(secondPass.carry).toBe("");
  });
});
