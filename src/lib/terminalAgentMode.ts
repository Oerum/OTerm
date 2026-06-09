import agyLogo from "../assets/cli-agents/agy.svg";
import ampLogo from "../assets/cli-agents/amp.svg";
import auggieLogo from "../assets/cli-agents/auggie.svg";
import claudeLogo from "../assets/cli-agents/claude.svg";
import copilotLogo from "../assets/cli-agents/copilot.svg";
import cursorLogo from "../assets/cli-agents/cursor.svg";
import droidLogo from "../assets/cli-agents/droid.svg";
import geminiLogo from "../assets/cli-agents/gemini_cli.svg";
import gooseLogo from "../assets/cli-agents/goose.svg";
import openaiLogo from "../assets/cli-agents/openai.svg";
import opencodeLogo from "../assets/cli-agents/opencode.svg";
import piLogo from "../assets/cli-agents/pi.svg";

export type CliAgentId =
  | "claude"
  | "gemini"
  | "codex"
  | "opencode"
  | "copilot"
  | "cursor"
  | "amp"
  | "droid"
  | "pi"
  | "auggie"
  | "goose"
  | "hermes"
  | "vibe"
  | "agy";

export interface CliAgentDefinition {
  id: CliAgentId;
  commandPrefixes: readonly string[];
  displayName: string;
  brandColor: string;
  logoFile: string | null;
  /** Substring hints for npx/pnpm/bunx package invocations */
  packageHints: readonly string[];
}

export const CLI_AGENTS: readonly CliAgentDefinition[] = [
  {
    id: "claude",
    commandPrefixes: ["claude"],
    displayName: "Claude Code",
    brandColor: "#D97757",
    logoFile: claudeLogo,
    packageHints: ["claude"],
  },
  {
    id: "gemini",
    commandPrefixes: ["gemini"],
    displayName: "Gemini",
    brandColor: "#4285F4",
    logoFile: geminiLogo,
    packageHints: ["gemini"],
  },
  {
    id: "codex",
    commandPrefixes: ["codex"],
    displayName: "Codex",
    brandColor: "#000000",
    logoFile: openaiLogo,
    packageHints: ["codex"],
  },
  {
    id: "opencode",
    commandPrefixes: ["opencode"],
    displayName: "OpenCode",
    brandColor: "#808080",
    logoFile: opencodeLogo,
    packageHints: ["opencode"],
  },
  {
    id: "copilot",
    commandPrefixes: ["copilot"],
    displayName: "Copilot",
    brandColor: "#8534F3",
    logoFile: copilotLogo,
    packageHints: ["copilot"],
  },
  {
    id: "cursor",
    commandPrefixes: ["agent"],
    displayName: "Cursor",
    brandColor: "#26251E",
    logoFile: cursorLogo,
    packageHints: ["cursor"],
  },
  {
    id: "amp",
    commandPrefixes: ["amp"],
    displayName: "Amp",
    brandColor: "#F34E3F",
    logoFile: ampLogo,
    packageHints: ["amp"],
  },
  {
    id: "droid",
    commandPrefixes: ["droid"],
    displayName: "Droid",
    brandColor: "#FFFFFF",
    logoFile: droidLogo,
    packageHints: ["droid"],
  },
  {
    id: "pi",
    commandPrefixes: ["pi"],
    displayName: "Pi",
    brandColor: "#FFFFFF",
    logoFile: piLogo,
    packageHints: ["pi"],
  },
  {
    id: "auggie",
    commandPrefixes: ["auggie"],
    displayName: "Auggie",
    brandColor: "#FFFFFF",
    logoFile: auggieLogo,
    packageHints: ["auggie"],
  },
  {
    id: "goose",
    commandPrefixes: ["goose"],
    displayName: "Goose",
    brandColor: "#101010",
    logoFile: gooseLogo,
    packageHints: ["goose"],
  },
  {
    id: "hermes",
    commandPrefixes: ["hermes"],
    displayName: "Hermes",
    brandColor: "#7C3AED",
    logoFile: null,
    packageHints: ["hermes"],
  },
  {
    id: "vibe",
    commandPrefixes: ["vibe", "vibe-acp"],
    displayName: "Mistral Vibe",
    brandColor: "#FA520F",
    logoFile: null,
    packageHints: ["vibe"],
  },
  {
    id: "agy",
    commandPrefixes: ["agy"],
    displayName: "Agy",
    brandColor: "#00D4AA",
    logoFile: agyLogo,
    packageHints: ["agy"],
  },
] as const;

const AGENT_BY_PREFIX = new Map<string, CliAgentId>(
  CLI_AGENTS.flatMap((agent) =>
    agent.commandPrefixes.map((prefix) => [prefix.toLowerCase(), agent.id] as const),
  ),
);

const AGENT_BY_ID = new Map<CliAgentId, CliAgentDefinition>(
  CLI_AGENTS.map((agent) => [agent.id, agent]),
);

const PACKAGE_RUNNER = /^(?:npx|pnpm(?:\s+dlx)?|bunx|bun)\s+/i;

function firstToken(command: string): string {
  return command.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

export function getCliAgentDefinition(id: CliAgentId): CliAgentDefinition {
  return AGENT_BY_ID.get(id)!;
}

export function detectCliAgent(command: string): CliAgentId | null {
  const trimmed = command.trim();
  if (!trimmed) return null;

  const first = firstToken(trimmed);
  const direct = AGENT_BY_PREFIX.get(first);
  if (direct) return direct;

  if (PACKAGE_RUNNER.test(trimmed)) {
    const lower = trimmed.toLowerCase();
    for (const agent of CLI_AGENTS) {
      if (agent.packageHints.some((hint) => lower.includes(hint))) {
        return agent.id;
      }
    }
  }

  return null;
}

export function isAgentLaunchCommand(command: string): boolean {
  return detectCliAgent(command) !== null;
}

export function isAgentExitCommand(command: string): boolean {
  const t = command.trim().toLowerCase().replace(/^\/+/, "");
  return t === "exit" || t === "quit" || t === "logout";
}
