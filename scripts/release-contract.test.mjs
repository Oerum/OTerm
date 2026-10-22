import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("release contract", () => {
  it("pins @tauri-apps/plugin-dialog exact across npm and cargo", () => {
    const pkg = JSON.parse(read("../package.json"));
    const lock = JSON.parse(read("../package-lock.json"));
    const npmVersion = pkg.dependencies["@tauri-apps/plugin-dialog"];

    expect(lock.packages["node_modules/@tauri-apps/plugin-dialog"]?.version).toBe(npmVersion);

    const cargoLock = read("../src-tauri/Cargo.lock");
    const lockVersion = cargoLock.match(/name = "tauri-plugin-dialog"\r?\nversion = "([^"]+)"/)?.[1];
    expect(lockVersion).toBe(npmVersion);

    const cargoToml = read("../src-tauri/Cargo.toml");
    const tomlVersion = cargoToml.match(/tauri-plugin-dialog\s*=\s*(?:\{\s*version\s*=\s*)?"([^"]+)"/)?.[1];
    expect(tomlVersion).toBe(`=${npmVersion}`);
  });

  it("configures tauri-action uploadUpdaterJson in publish workflow", () => {
    const workflow = read("../.github/workflows/publish.yml");
    const predicate = "${{ matrix.include_updater && matrix.updater_manifest == 'latest.json' }}";

    expect(workflow).toContain("uses: tauri-apps/tauri-action@v1");
    expect(workflow).toContain(`uploadUpdaterJson: ${predicate}`);
    expect(workflow).not.toContain("includeUpdaterJson");
    expect(workflow.match(/^\s*TAG_NAME: (.+)$/m)?.[1]).toBe("v${{ steps.tauri.outputs.appVersion }}");
  });
});
