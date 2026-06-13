/**
 * Fail if git tag (vX.Y.Z) does not match package.json version.
 * Usage: node scripts/verify-tag-version.mjs v0.1.9
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const tag = process.argv[2];
if (!tag?.startsWith("v")) {
  console.error(`Usage: node scripts/verify-tag-version.mjs vX.Y.Z`);
  process.exit(1);
}

const tagVersion = tag.slice(1);
const pkgVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

if (tagVersion !== pkgVersion) {
  console.error(
    `Tag ${tag} (${tagVersion}) does not match package.json (${pkgVersion}). ` +
      `Run: npm version ${tagVersion} && node scripts/sync-version.mjs`,
  );
  process.exit(1);
}

console.log(`Tag ${tag} matches package.json (${pkgVersion})`);
