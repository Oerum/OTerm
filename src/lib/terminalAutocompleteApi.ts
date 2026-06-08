import { generateCommitAiCompletion } from "./commitAiApi";
import {
  DEFAULT_TERMINAL_AUTOCOMPLETE_SYSTEM_PROMPT,
  type TerminalCommandExchange,
  type TerminalAutocompleteSettings,
} from "../types/terminalAutocomplete";

function truncate(text: string, max = 1200): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function buildUserPrompt(
  exchanges: TerminalCommandExchange[],
  currentInput: string,
  cwd: string,
  responseContextCount: number,
): string {
  const responseBudget = Math.max(400, responseContextCount * 120);
  const history = exchanges
    .map(
      (entry, index) =>
        `### ${index + 1}\nCommand: ${entry.command}\nOutput:\n${truncate(entry.response, responseBudget)}`,
    )
    .join("\n\n");

  return [
    "Suggest one command the user is likely typing next.",
    "Current working directory:",
    cwd || "~",
    "",
    "## Recent terminal history",
    history || "(none)",
    "",
    "## Partial input",
    currentInput.trim() || "(empty)",
  ].join("\n");
}

function cleanSuggestion(raw: string, currentInput: string): string | null {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```[\w-]*\n?/, "").replace(/\n?```$/, "").trim();
  }
  const line = text.split("\n").find((row) => row.trim())?.trim() ?? "";
  if (!line) return null;
  if (currentInput.trim() && !line.startsWith(currentInput.trim())) {
    if (line.includes(currentInput.trim())) return line;
  }
  return line;
}

export async function fetchTerminalAutocompleteSuggestion(
  settings: TerminalAutocompleteSettings,
  exchanges: TerminalCommandExchange[],
  currentInput: string,
  cwd: string,
): Promise<string | null> {
  const userPrompt = buildUserPrompt(
    exchanges,
    currentInput,
    cwd,
    settings.responseContextCount,
  );
  const systemPrompt = settings.systemPrompt.trim();
  const raw = await generateCommitAiCompletion(
    settings.endpoint,
    settings.provider,
    settings.model,
    systemPrompt || DEFAULT_TERMINAL_AUTOCOMPLETE_SYSTEM_PROMPT,
    userPrompt,
    settings.apiKey,
    {
      useReasoning: settings.enableReasoning,
      allowToolCalls: settings.enableToolCalls,
      completionMode: "terminal",
    },
  );
  return cleanSuggestion(raw, currentInput);
}
