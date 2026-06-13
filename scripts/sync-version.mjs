/**
 * Sync semver across package.json, package-lock.json, tauri.conf.json, and Cargo.toml.
 * Usage:
 *   node scripts/sync-version.mjs              # sync tauri + cargo from package.json
 *   node scripts/sync-version.mjs 0.1.9        # bump npm files then sync tauri + cargo
 *   node scripts/sync-version.mjs --from-tag v0.1.9
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseVersionArg(argv) {
  if (argv[2] === "--from-tag") {
    const tag = argv[3];
    if (!tag?.startsWith("v")) {
      throw new Error(`Invalid tag "${tag}" — expected format vX.Y.Z`);
    }
    return tag.slice(1);
  }
  if (argv[2]) {
    return argv[2].replace(/^v/, "");
  }
  return readJson(join(root, "package.json")).version;
}

function setCargoVersion(version) {
  const cargoPath = join(root, "src-tauri", "Cargo.toml");
  const text = readFileSync(cargoPath, "utf8");
  const current = text.match(/^version = "(.*)"/m)?.[1];
  if (current === version) {
    return;
  }
  const updated = text.replace(
    /^version = ".*"$/m,
    `version = "${version}"`,
  );
  if (updated === text) {
    throw new Error(`Could not update version in ${cargoPath}`);
  }
  writeFileSync(cargoPath, updated);
}

function setTauriVersion(version) {
  const tauriPath = join(root, "src-tauri", "tauri.conf.json");
  const config = readJson(tauriPath);
  if (config.version === version) {
    return;
  }
  config.version = version;
  writeFileSync(tauriPath, `${JSON.stringify(config, null, 2)}\n`);
}

function readVersions() {
  const pkg = readJson(join(root, "package.json")).version;
  const tauri = readJson(join(root, "src-tauri", "tauri.conf.json")).version;
  const cargoText = readFileSync(join(root, "src-tauri", "Cargo.toml"), "utf8");
  const cargoMatch = cargoText.match(/^version = "(.*)"/m);
  return {
    packageJson: pkg,
    tauriConf: tauri,
    cargoToml: cargoMatch?.[1] ?? null,
  };
}

const targetVersion = parseVersionArg(process.argv);

const pkgVersion = readJson(join(root, "package.json")).version;
if (pkgVersion !== targetVersion) {
  execSync(
    `npm version ${targetVersion} --no-git-tag-version --allow-same-version --ignore-scripts`,
    {
      cwd: root,
      stdio: "inherit",
    },
  );
}

setTauriVersion(targetVersion);
setCargoVersion(targetVersion);

const after = readVersions();
const aligned =
  after.packageJson === targetVersion &&
  after.tauriConf === targetVersion &&
  after.cargoToml === targetVersion;

if (!aligned) {
  console.error("Version sync failed:", after);
  process.exit(1);
}

console.log(
  `Synced version to ${targetVersion} across package.json, tauri.conf.json, and Cargo.toml`,
);
