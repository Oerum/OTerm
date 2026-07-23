import type { TagRefInfo } from "../types/branchManager";

interface SemverInfo {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
  isSemver: boolean;
}

function parseSemver(str: string): SemverInfo {
  // Matches optional 'v' or 'V' prefix, followed by major.minor.patch.
  // Optional pre-release info starting with '-' can follow.
  const match = str.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-(.+))?$/i);
  if (match) {
    return {
      major: parseInt(match[1], 10),
      minor: match[2] !== undefined ? parseInt(match[2], 10) : 0,
      patch: match[3] !== undefined ? parseInt(match[3], 10) : 0,
      prerelease: match[4] || "",
      isSemver: true,
    };
  }
  return {
    major: 0,
    minor: 0,
    patch: 0,
    prerelease: "",
    isSemver: false,
  };
}

function compareTags(a: TagRefInfo, b: TagRefInfo): number {
  const semverA = parseSemver(a.name);
  const semverB = parseSemver(b.name);

  if (semverA.isSemver && semverB.isSemver) {
    if (semverA.major !== semverB.major) {
      return semverB.major - semverA.major;
    }
    if (semverA.minor !== semverB.minor) {
      return semverB.minor - semverA.minor;
    }
    if (semverA.patch !== semverB.patch) {
      return semverB.patch - semverA.patch;
    }

    // Prerelease comparison: version without prerelease is higher
    if (semverA.prerelease !== semverB.prerelease) {
      if (semverA.prerelease === "") return -1; // a is higher
      if (semverB.prerelease === "") return 1;  // b is higher
      // Both have prereleases, compare alphabetically descending
      return semverB.prerelease.localeCompare(semverA.prerelease, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    }

    // Fully identical version fields, fall back to string comparison descending
    return b.name.localeCompare(a.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  // If only one is semver, semver comes first
  if (semverA.isSemver) return -1;
  if (semverB.isSemver) return 1;

  // Neither is semver, compare alphabetically descending
  return b.name.localeCompare(a.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function sortTags(tags: TagRefInfo[]): TagRefInfo[] {
  return [...tags].sort(compareTags);
}
