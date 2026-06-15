import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { updaterEndpointForManifest } from "./updater-manifest.mjs";

const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? "").split("/");
const token = process.env.GITHUB_TOKEN;
const manifestName = process.env.UPDATER_MANIFEST;
const releaseId = Number(process.env.RELEASE_ID);
const version = process.env.APP_VERSION;
const notes = process.env.RELEASE_BODY ?? "";
const tagName = process.env.TAG_NAME?.replace(/^refs\/tags\//, "") ?? "";
const artifactPaths = JSON.parse(process.env.ARTIFACT_PATHS ?? "[]");

function requireEnv(name, value) {
  if (value === undefined || value === "" || Number.isNaN(value)) {
    throw new Error(`Missing or invalid ${name}`);
  }
}

requireEnv("GITHUB_REPOSITORY", owner && repo ? owner : "");
requireEnv("GITHUB_TOKEN", token);
requireEnv("UPDATER_MANIFEST", manifestName);
requireEnv("RELEASE_ID", releaseId);
requireEnv("APP_VERSION", version);

function sanitizeAssetName(name) {
  return name
    .trim()
    .replace(/[ ()[\]{}]/g, ".")
    .replace(/\.\./g, ".")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function githubApi(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} failed (${response.status}): ${await response.text()}`);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function targetInfo() {
  let os =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "macos"
        : "linux";
  if (os === "macos") {
    os = "darwin";
  }

  let arch = process.arch;
  if (arch === "x64") {
    arch = "x86_64";
  }

  return { os, arch };
}

function signaturePriority(path) {
  const priorities = [
    ".nsis.zip.sig",
    ".msi.zip.sig",
    ".deb.sig",
    ".rpm.sig",
    ".exe.sig",
    ".AppImage.tar.gz.sig",
    ".AppImage.sig",
  ];
  for (let index = 0; index < priorities.length; index += 1) {
    if (path.endsWith(priorities[index])) {
      return 100 - index;
    }
  }
  return 0;
}

function bundleFromSigPath(path) {
  if (path.endsWith(".nsis.zip.sig") || path.endsWith(".exe.sig")) {
    return "nsis";
  }
  if (path.endsWith(".msi.zip.sig") || path.endsWith(".msi.sig")) {
    return "msi";
  }
  if (path.endsWith(".deb.sig")) {
    return "deb";
  }
  if (path.endsWith(".rpm.sig")) {
    return "rpm";
  }
  if (path.endsWith(".AppImage.tar.gz.sig") || path.endsWith(".AppImage.sig")) {
    return "appimage";
  }
  return "unknown";
}

function fixDownloadUrl(url) {
  if (!tagName) {
    return url;
  }
  return url.replace(/\/download\/(untagged-[^/]+)\//, `/download/${encodeURIComponent(tagName)}/`);
}

const versionContent = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {},
};

const assets = await githubApi(
  `/repos/${owner}/${repo}/releases/${releaseId}/assets?per_page=100`,
);
const existing = assets.find((asset) => asset.name === manifestName);
if (existing) {
  const response = await fetch(existing.url, {
    headers: {
      Accept: "application/octet-stream",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download existing ${manifestName}: ${response.status}`);
  }
  const parsed = JSON.parse(await response.text());
  versionContent.platforms = parsed.platforms ?? {};
}

const downloadUrls = new Map(assets.map((asset) => [asset.name, asset.browser_download_url]));

function resolveDownloadUrl(signaturePath) {
  const sigBasename = basename(signaturePath);
  const rawUpdaterName = basename(sigBasename, extname(sigBasename));
  const candidates = [
    rawUpdaterName,
    sanitizeAssetName(rawUpdaterName),
    sanitizeAssetName(sigBasename).replace(/\.sig$/i, ""),
  ];

  for (const candidate of candidates) {
    const downloadUrl = downloadUrls.get(candidate);
    if (downloadUrl) {
      return downloadUrl;
    }
  }

  const sanitizedUpdaterName = sanitizeAssetName(rawUpdaterName);
  for (const [name, downloadUrl] of downloadUrls) {
    if (sanitizeAssetName(name) === sanitizedUpdaterName) {
      return downloadUrl;
    }
  }

  return undefined;
}

const signatureFiles = artifactPaths
  .filter((path) => path.endsWith(".sig"))
  .map((path) => ({
    path,
    assetName: sanitizeAssetName(basename(path)),
    bundle: bundleFromSigPath(path),
  }))
  .sort((a, b) => signaturePriority(b.path) - signaturePriority(a.path));

if (signatureFiles.length === 0) {
  console.warn(`No updater signatures found in artifact paths. Skipping ${manifestName}.`);
  process.exit(0);
}

const { os, arch } = targetInfo();

for (const [index, signatureFile] of signatureFiles.entries()) {
  const downloadUrl = resolveDownloadUrl(signatureFile.path);
  if (!downloadUrl) {
    console.warn(`Release asset not found for signature ${basename(signatureFile.path)}`);
    continue;
  }

  const entry = {
    signature: readFileSync(signatureFile.path, "utf8"),
    url: fixDownloadUrl(downloadUrl),
  };

  if (index === 0) {
    versionContent.platforms[`${os}-${arch}`] = entry;
  }
  versionContent.platforms[`${os}-${arch}-${signatureFile.bundle}`] = entry;
}

writeFileSync(manifestName, `${JSON.stringify(versionContent, null, 2)}\n`);

if (existing) {
  await githubApi(
    `/repos/${owner}/${repo}/releases/assets/${existing.id}`,
    { method: "DELETE" },
  );
}

const body = readFileSync(manifestName);
const uploadResponse = await fetch(
  `https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(manifestName)}`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    body,
  },
);

if (!uploadResponse.ok) {
  throw new Error(
    `Failed to upload ${manifestName} (${uploadResponse.status}): ${await uploadResponse.text()}`,
  );
}

console.log(`Uploaded ${manifestName} for ${os}-${arch} (endpoint: ${updaterEndpointForManifest(manifestName)})`);
