import type { BranchRefInfo } from "../types/branchManager";

export type BranchFolderGroup = {
  kind: "folder";
  label: string;
  branches: BranchRefInfo[];
};

export type BranchSectionGroup = {
  kind: "section";
  label: string;
  items: Array<BranchRefInfo | BranchFolderGroup>;
};

function folderKey(name: string): string | null {
  const slash = name.lastIndexOf("/");
  if (slash < 0) return null;
  return `${name.slice(0, slash + 1)}`;
}

/** Normalized key for branch ordering (ignores `-`, `_`, `.`, spaces). */
export function branchSortKey(name: string): string {
  return name.toLowerCase().replace(/[-_.\s]+/g, "");
}

function compareBranchNames(a: string, b: string): number {
  const byKey = branchSortKey(a).localeCompare(branchSortKey(b));
  if (byKey !== 0) return byKey;
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function sortBranches(a: BranchRefInfo, b: BranchRefInfo): number {
  if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
  return compareBranchNames(a.name, b.name);
}

function isBranchFolder(item: BranchRefInfo | BranchFolderGroup): item is BranchFolderGroup {
  return "kind" in item && item.kind === "folder";
}

function itemSortName(item: BranchRefInfo | BranchFolderGroup): string {
  return isBranchFolder(item) ? item.label : item.name;
}

function sortBranchItems(
  a: BranchRefInfo | BranchFolderGroup,
  b: BranchRefInfo | BranchFolderGroup,
): number {
  return compareBranchNames(itemSortName(a), itemSortName(b));
}

function groupByPath(branches: BranchRefInfo[]): Array<BranchRefInfo | BranchFolderGroup> {
  const flat: BranchRefInfo[] = [];
  const folders = new Map<string, BranchRefInfo[]>();

  for (const branch of branches) {
    const key = folderKey(branch.name);
    if (!key) {
      flat.push(branch);
      continue;
    }
    const list = folders.get(key) ?? [];
    list.push(branch);
    folders.set(key, list);
  }

  const items: Array<BranchRefInfo | BranchFolderGroup> = [
    ...flat.sort(sortBranches),
    ...[...folders.entries()].map(([label, list]) => ({
      kind: "folder" as const,
      label,
      branches: list.sort(sortBranches),
    })),
  ];
  return items.sort(sortBranchItems);
}

function sectionLabel(branch: BranchRefInfo): string {
  if (!branch.isRemote) return "Local";
  return branch.remoteName ?? branch.name.split("/")[0] ?? "Remote";
}

export function groupBranches(refs: BranchRefInfo[]): BranchSectionGroup[] {
  const sections = new Map<string, BranchRefInfo[]>();

  for (const ref of refs) {
    const label = sectionLabel(ref);
    const list = sections.get(label) ?? [];
    list.push(ref);
    sections.set(label, list);
  }

  const orderedLabels = [
    ...(sections.has("Local") ? ["Local"] : []),
    ...[...sections.keys()].filter((k) => k !== "Local").sort(),
  ];

  return orderedLabels.map((label) => ({
    kind: "section" as const,
    label,
    items: groupByPath(sections.get(label) ?? []),
  }));
}

function matchesBranchFilter(branch: BranchRefInfo, filter: string): boolean {
  const q = filter.trim().toLowerCase();
  if (!q) return true;
  return branch.name.toLowerCase().includes(q);
}

export function filterBranchSections(
  sections: BranchSectionGroup[],
  filter: string,
): BranchSectionGroup[] {
  const q = filter.trim().toLowerCase();
  if (!q) return sections;

  return sections
    .map((section) => {
      const items = section.items
        .map((item) => {
          if ("kind" in item && item.kind === "folder") {
            const branches = item.branches.filter((b) => matchesBranchFilter(b, q));
            return branches.length ? { ...item, branches } : null;
          }
          const branch = item as BranchRefInfo;
          return matchesBranchFilter(branch, q) ? branch : null;
        })
        .filter((item): item is BranchRefInfo | BranchFolderGroup => item !== null);
      return items.length ? { ...section, items } : null;
    })
    .filter((section): section is BranchSectionGroup => section !== null);
}

export function localBranchName(branch: BranchRefInfo): string | null {
  if (!branch.isRemote) return branch.name;
  const slash = branch.name.indexOf("/");
  if (slash < 0 || slash >= branch.name.length - 1) return null;
  return branch.name.slice(slash + 1);
}

export function canMergeBranchLocally(
  branch: BranchRefInfo,
  localBranches: string[],
): boolean {
  if (!branch.isRemote) return true;
  const name = localBranchName(branch);
  return !!name && localBranches.includes(name);
}
