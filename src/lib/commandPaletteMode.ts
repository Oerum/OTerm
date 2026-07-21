import type { CommandPaletteCategory } from "./commandPaletteItems";

export type PaletteMode = "all" | "commands" | "terminals" | "history" | "agents";

export type PalettePrefix = ">" | "@" | "$" | "#" | null;

const MODE_CATEGORIES: Record<PaletteMode, CommandPaletteCategory[] | null> = {
  all: null,
  commands: ["actions", "settings", "git", "ssh"],
  terminals: ["terminals", "groups"],
  history: ["history"],
  agents: ["agents"],
};

export function parsePaletteQuery(raw: string): {
  mode: PaletteMode;
  needle: string;
  prefix: PalettePrefix;
} {
  if (raw.startsWith(">")) {
    return { mode: "commands", needle: raw.slice(1).trimStart(), prefix: ">" };
  }
  if (raw.startsWith("@")) {
    return { mode: "terminals", needle: raw.slice(1).trimStart(), prefix: "@" };
  }
  if (raw.startsWith("$")) {
    return { mode: "history", needle: raw.slice(1).trimStart(), prefix: "$" };
  }
  if (raw.startsWith("#")) {
    return { mode: "agents", needle: raw.slice(1).trimStart(), prefix: "#" };
  }
  return { mode: "all", needle: raw, prefix: null };
}

export function categoriesForPaletteMode(mode: PaletteMode): CommandPaletteCategory[] | null {
  return MODE_CATEGORIES[mode];
}
