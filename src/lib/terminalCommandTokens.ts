export type CommandTokenKind = "command" | "subcommand" | "option" | "argument" | "variable";

export type CommandTokenSpan = {
  start: number;
  end: number;
  kind: CommandTokenKind;
  text: string;
};

const VAR_PREFIXES = ["$", "%", "@", "&"];

function isOption(token: string): boolean {
  return token.startsWith("-") || token.startsWith("/");
}

function isVariable(token: string): boolean {
  return VAR_PREFIXES.some((prefix) => token.startsWith(prefix));
}

type RawPart = { text: string; start: number; end: number };

function splitQuotedParts(trimmed: string): RawPart[] {
  const parts: RawPart[] = [];
  let current = "";
  let start = -1;
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      if (!current) start = i;
      quote = ch;
      current += ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        parts.push({ text: current, start, end: i });
        current = "";
        start = -1;
      }
      continue;
    }
    if (!current) start = i;
    current += ch;
  }
  if (current) parts.push({ text: current, start, end: trimmed.length });
  return parts;
}

function classifyPart(
  text: string,
  seenCommand: boolean,
  seenSubcommand: boolean,
): { kind: CommandTokenKind; seenCommand: boolean; seenSubcommand: boolean } {
  if (isVariable(text)) return { kind: "variable", seenCommand, seenSubcommand };
  if (isOption(text)) return { kind: "option", seenCommand, seenSubcommand };
  if (!seenCommand) return { kind: "command", seenCommand: true, seenSubcommand };
  if (!seenSubcommand && !text.includes("=") && !text.includes("\\") && !text.includes("/")) {
    return { kind: "subcommand", seenCommand, seenSubcommand: true };
  }
  return { kind: "argument", seenCommand, seenSubcommand };
}

/** ponytail: quote-aware split only; no shell-specific grammar. */
export function tokenizeCommandLine(command: string): CommandTokenSpan[] {
  const trimmed = command.trim();
  if (!trimmed) return [];

  const spans: CommandTokenSpan[] = [];
  let seenCommand = false;
  let seenSubcommand = false;

  for (const part of splitQuotedParts(trimmed)) {
    const classified = classifyPart(part.text, seenCommand, seenSubcommand);
    seenCommand = classified.seenCommand;
    seenSubcommand = classified.seenSubcommand;
    spans.push({ start: part.start, end: part.end, kind: classified.kind, text: part.text });
  }

  return spans;
}
