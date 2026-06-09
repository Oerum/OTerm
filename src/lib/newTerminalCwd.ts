export function cwdForNewTerminal(
  activeCwd: string | undefined,
  explicitCwd?: string,
): string | undefined {
  const candidate = explicitCwd ?? activeCwd;
  if (!candidate || candidate === "~") return undefined;
  return candidate;
}
