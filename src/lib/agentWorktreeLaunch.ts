import type { BranchRefInfo } from "../types/branchManager";
import { readFile, writeFile } from "./fsApi";

export const UNGROUPED_WORKTREE_BASE_KEY = "oterm:terminal-ungrouped-worktree-base";

export type AgentWorktreeLaunchMode = "current" | "new";

export interface AgentWorktreeLaunchConfirm {
  mode: AgentWorktreeLaunchMode;
  worktreeName: string;
  basePath: string;
  startPoint: string;
}

function pathSeparator(path: string): "\\" | "/" {
  return path.includes("\\") ? "\\" : "/";
}

export function joinPath(base: string, ...parts: string[]): string {
  const sep = pathSeparator(base);
  let result = base.replace(/[\\/]+$/, "");
  for (const part of parts) {
    const cleaned = part
      .trim()
      .replace(/^[\\/]+|[\\/]+$/g, "")
      .replace(/[\\/]+/g, "-");
    if (cleaned) result += `${sep}${cleaned}`;
  }
  return result;
}

export function defaultWorktreeBasePath(
  repoRoot: string,
  savedPath?: string | null,
): string {
  const saved = savedPath?.trim();
  if (saved) return saved;
  return joinPath(repoRoot, ".oterm");
}

export function suggestWorktreeName(
  existingPaths: string[],
  existingBranches: string[],
  prefix = "agent-worktree",
): string {
  const usedNames = new Set(
    existingPaths
      .map((path) => path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "")
      .filter(Boolean)
      .map((name) => name.toLowerCase()),
  );
  const usedBranches = new Set(existingBranches.map((name) => name.toLowerCase()));

  for (let index = 1; index < 1000; index += 1) {
    const name = `${prefix}-${index}`;
    const key = name.toLowerCase();
    if (!usedNames.has(key) && !usedBranches.has(key)) return name;
  }

  return `${prefix}-${Date.now()}`;
}

export function resolveWorktreeTargetPath(basePath: string, worktreeName: string): string {
  return joinPath(basePath, worktreeName.trim() || "agent-worktree");
}

export function resolveWorktreeStartPoint(
  selectedRef: string,
  startFromOrigin: boolean,
  branches: BranchRefInfo[],
): string {
  const ref = selectedRef.trim();
  if (!ref) return ref;
  if (!startFromOrigin || ref.includes("/")) return ref;

  const remote = branches.find(
    (branch) => branch.isRemote && branch.name === `origin/${ref}`,
  );
  return remote?.name ?? ref;
}

export function filterBranchRefs(branches: BranchRefInfo[], query: string): BranchRefInfo[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return branches;
  return branches.filter((branch) => branch.name.toLowerCase().includes(needle));
}

export async function ensureOtermInGitignore(repoRoot: string): Promise<void> {
  const gitignorePath = joinPath(repoRoot, ".gitignore");
  let content = "";
  try {
    const data = await readFile(gitignorePath);
    content = new TextDecoder().decode(data);
  } catch {
    // File might not exist
  }

  const lines = content.split(/\r?\n/);
  if (
    lines.some(
      (line) =>
        line.trim() === ".oterm" ||
        line.trim() === "/.oterm" ||
        line.trim() === ".oterm/" ||
        line.trim() === ".oterm/*",
    )
  ) {
    return;
  }

  const append = content.length > 0 && !content.endsWith("\n") ? "\n.oterm/\n" : ".oterm/\n";
  content += append;
  await writeFile(gitignorePath, new TextEncoder().encode(content));
}
