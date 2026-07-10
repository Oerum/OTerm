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

/** ponytail: quote-aware split only; no shell-specific grammar. */
export function tokenizeCommandLine(command: string): CommandTokenSpan[] {
  const trimmed = command.trim();
  if (!trimmed) return [];

  const parts: { text: string; start: number; end: number }[] = [];
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
  if (current) {
    parts.push({ text: current, start, end: trimmed.length });
  }

  const spans: CommandTokenSpan[] = [];
  let seenCommand = false;
  let seenSubcommand = false;

  for (const part of parts) {
    const text = part.text;
    let kind: CommandTokenKind = "argument";
    if (isVariable(text)) {
      kind = "variable";
    } else if (isOption(text)) {
      kind = "option";
    } else if (!seenCommand) {
      kind = "command";
      seenCommand = true;
    } else if (!seenSubcommand && !text.includes("=") && !text.includes("\\") && !text.includes("/")) {
      kind = "subcommand";
      seenSubcommand = true;
    } else {
      kind = "argument";
    }
    spans.push({ start: part.start, end: part.end, kind, text });
  }

  return spans;
}
