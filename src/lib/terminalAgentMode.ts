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
  | "agy"
  | "cline"
  | "aider"
  | "kilo"
  | "kimi"
  | "kiro"
  | "qwen"
  | "continue"
  | "codebuff"
  | "crush"
  | "rovodev"
  | "omp";

export interface CliAgentDefinition {
  id: CliAgentId;
  commandPrefixes: readonly string[];
  displayName: string;
  brandColor: string;
  logoFile: string | null;
  launchCommand?: string;
  docsUrl?: string;
  /** Exact package names for supported package runners. */
  packageHints: readonly string[];
}

export const CLI_AGENTS: readonly CliAgentDefinition[] = [
  {
    id: "claude",
    commandPrefixes: ["claude"],
    displayName: "Claude Code",
    brandColor: "#D97757",
    logoFile: claudeLogo,
    packageHints: ["claude", "@anthropic-ai/claude-code"],
  },
  {
    id: "gemini",
    commandPrefixes: ["gemini"],
    displayName: "Gemini",
    brandColor: "#4285F4",
    logoFile: geminiLogo,
    packageHints: ["gemini", "@google/gemini-cli"],
  },
  {
    id: "agy",
    commandPrefixes: ["agy"],
    displayName: "Agy",
    brandColor: "#00D4AA",
    logoFile: agyLogo,
    packageHints: ["agy"],
  },
  {
    id: "codex",
    commandPrefixes: ["codex"],
    displayName: "Codex",
    brandColor: "#000000",
    logoFile: openaiLogo,
    packageHints: ["codex", "@openai/codex"],
  },
  {
    id: "opencode",
    commandPrefixes: ["opencode"],
    displayName: "OpenCode",
    brandColor: "#808080",
    logoFile: opencodeLogo,
    packageHints: ["opencode", "opencode-ai"],
  },
  {
    id: "copilot",
    commandPrefixes: ["copilot"],
    displayName: "Copilot",
    brandColor: "#8534F3",
    logoFile: copilotLogo,
    packageHints: ["copilot", "@github/copilot"],
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
    packageHints: ["amp", "@sourcegraph/amp"],
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
    packageHints: ["pi", "@mariozechner/pi-coding-agent", "@earendil-works/pi-coding-agent"],
  },
  {
    id: "auggie",
    commandPrefixes: ["auggie"],
    displayName: "Auggie",
    brandColor: "#FFFFFF",
    logoFile: auggieLogo,
    packageHints: ["auggie", "@augmentcode/auggie"],
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
    id: "cline",
    commandPrefixes: ["cline"],
    displayName: "Cline",
    brandColor: "#808080",
    logoFile: null,
    packageHints: ["cline"],
    docsUrl: "https://docs.cline.bot/getting-started/installing-cline",
  },
  {
    id: "aider",
    commandPrefixes: ["aider"],
    displayName: "Aider",
    brandColor: "#808080",
    logoFile: null,
    packageHints: ["aider", "aider-chat"],
    docsUrl: "https://aider.chat/docs/install.html",
  },
  {
    id: "kilo",
    commandPrefixes: ["kilo"],
    displayName: "Kilo Code",
    brandColor: "#808080",
    logoFile: null,
    packageHints: ["kilo", "@kilocode/cli"],
    docsUrl: "https://kilo.ai/docs/code-with-ai/platforms/cli",
  },
  {
    id: "kimi",
    commandPrefixes: ["kimi"],
    displayName: "Kimi Code",
    brandColor: "#808080",
    logoFile: null,
    packageHints: ["kimi", "@moonshot-ai/kimi-code"],
    docsUrl: "https://moonshotai.github.io/kimi-code/en/guides/getting-started",
  },
  {
    id: "kiro",
    commandPrefixes: ["kiro-cli"],
    displayName: "Kiro CLI",
    brandColor: "#808080",
    logoFile: null,
    packageHints: ["kiro-cli"],
    docsUrl: "https://kiro.dev/docs/cli/reference/cli-commands/",
  },
  {
    id: "qwen",
    commandPrefixes: ["qwen"],
    displayName: "Qwen Code",
    brandColor: "#808080",
    logoFile: null,
    packageHints: ["qwen", "@qwen-code/qwen-code"],
    docsUrl: "https://qwenlm.github.io/qwen-code-docs/en/users/quickstart/",
  },
  {
    id: "continue",
    commandPrefixes: ["cn"],
    displayName: "Continue",
    brandColor: "#808080",
    logoFile: null,
    packageHints: ["cn", "@continuedev/cli"],
    docsUrl: "https://github.com/continuedev/continue/tree/main/extensions/cli",
  },
  {
    id: "codebuff",
    commandPrefixes: ["codebuff"],
    displayName: "Codebuff",
    brandColor: "#808080",
    logoFile: null,
    packageHints: ["codebuff"],
    docsUrl: "https://www.codebuff.com/docs/help/quick-start",
  },
  {
    id: "crush",
    commandPrefixes: ["crush"],
    displayName: "Crush",
    brandColor: "#808080",
    logoFile: null,
    packageHints: ["crush", "@charmland/crush"],
    docsUrl: "https://github.com/charmbracelet/crush",
  },
  {
    id: "rovodev",
    commandPrefixes: ["acli rovodev run"],
    displayName: "Rovo Dev",
    brandColor: "#808080",
    logoFile: null,
    packageHints: [],
    docsUrl: "https://developer.atlassian.com/cloud/acli/guides/how-to-get-started/",
    launchCommand: "acli rovodev run",
  },
  {
    id: "omp",
    commandPrefixes: ["omp"],
    displayName: "oh-my-pi",
    brandColor: "#808080",
    logoFile: null,
    packageHints: ["omp", "@oh-my-pi/pi-coding-agent"],
    docsUrl: "https://github.com/can1357/oh-my-pi/blob/main/docs/cli-reference.md",
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

export type AgentLaunchRequest = { agentId: CliAgentId; runtime?: "native" | "unsloth" };

const UNSLOTH_TARGETS = new Set<CliAgentId>(["claude", "codex", "opencode", "hermes", "pi"]);
const UNSLOTH_PERSIST = new Set<CliAgentId>(["codex", "hermes", "pi"]);

export function supportsUnslothRuntime(agentId: CliAgentId): boolean {
  return UNSLOTH_TARGETS.has(agentId);
}

export function buildAgentLaunchCommand(request: AgentLaunchRequest): string {
  const agent = AGENT_BY_ID.get(request.agentId);
  if (!agent) throw new Error("Unknown CLI agent");
  if (request.runtime === "unsloth") {
    if (!supportsUnslothRuntime(agent.id)) throw new Error("Unsupported Unsloth agent");
    return `unsloth start ${agent.id}${UNSLOTH_PERSIST.has(agent.id) ? " --persist" : ""}`;
  }
  if (request.runtime && request.runtime !== "native") throw new Error("Unknown agent runtime");
  return agent.launchCommand ?? agent.commandPrefixes[0]!;
}

function executableStem(token: string): string {
  return (token.split(/[\\/]/).pop() ?? token).toLowerCase().replace(/\.(?:exe|cmd|bat|com)$/i, "");
}

function packageAgent(token: string): CliAgentId | null {
  const packageName = token.toLowerCase().replace(/^(?:(@[^/]+\/[^@/]+)|([^@/]+))@.+$/, "$1$2");
  return CLI_AGENTS.find((agent) => agent.packageHints.includes(packageName))?.id ?? null;
}

function scriptAgent(token: string): CliAgentId | null {
  const path = token.toLowerCase().replace(/\\/g, "/");
  const parts = path.split("/");
  const base = parts[parts.length - 1] ?? "";
  const direct = AGENT_BY_PREFIX.get(executableStem(base).replace(/\.(?:[cm]?js|py)$/, ""));
  if (direct) return direct;
  const moduleIndex = parts.lastIndexOf("node_modules");
  if (moduleIndex >= 0) {
    const root = parts[moduleIndex + 1] ?? "";
    const name = root.startsWith("@") ? `${root}/${parts[moduleIndex + 2] ?? ""}` : root;
    return packageAgent(name);
  }
  const scopeIndex = parts.findIndex((part) => part.startsWith("@"));
  if (scopeIndex >= 0) return packageAgent(`${parts[scopeIndex]}/${parts[scopeIndex + 1] ?? ""}`);
  const directory = parts[parts.length - 2] ?? "";
  if (directory === "agy" && base === "cli.js") return "agy";
  return directory === "aider" && base === "__main__.py" ? "aider" : null;
}

function detectAgentTokens(tokens: string[]): CliAgentId | null {
  const first = executableStem(tokens[0] ?? "");
  if (first === "unsloth") {
    const id = tokens[2] as CliAgentId;
    return tokens[1] === "start" && supportsUnslothRuntime(id) ? id : null;
  }
  if (first === "acli") return tokens[1] === "rovodev" && tokens[2] === "run" ? "rovodev" : null;
  const direct = AGENT_BY_PREFIX.get(first);
  if (direct) return direct;
  if (["npx", "bunx"].includes(first)) {
    let index = 1;
    while (["-y", "--yes", "--no-install", "--"].includes(tokens[index] ?? "")) index++;
    return packageAgent(tokens[index] ?? "");
  }
  if (first === "pnpm" || first === "npm") {
    const action = tokens[1];
    if (first === "pnpm" && action === "dlx") return packageAgent(tokens[2] ?? "");
    if (action === "exec") return packageAgent(tokens[tokens[2] === "--" ? 3 : 2] ?? "");
    return null;
  }
  if (["node", "nodejs", "bun", "deno"].includes(first)) {
    let index = 1;
    if (["run", "--"].includes(tokens[index] ?? "")) index++;
    while (["--require", "-r", "--import", "--loader"].includes(tokens[index] ?? "")) index += 2;
    return scriptAgent(tokens[index] ?? "") ?? (first === "bun" ? packageAgent(tokens[index] ?? "") : null);
  }
  if (/^python(?:3(?:\.\d+)?)?$/.test(first)) {
    return tokens[1] === "-m" ? packageAgent(tokens[2] ?? "") : scriptAgent(tokens[1] ?? "");
  }
  return null;
}

export function getCliAgentDefinition(id: CliAgentId): CliAgentDefinition {
  return AGENT_BY_ID.get(id)!;
}

export function detectCliAgent(command: string): CliAgentId | null {
  // Only executable/package positions matter; prompt arguments never identify an agent.
  const tokens = Array.from(command.matchAll(/"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s]+)/g),
    (match) => match[1] ?? match[2] ?? match[3]!);
  if (tokens[0] === "&") tokens.shift();
  return detectAgentTokens(tokens);
}

export function isAgentLaunchCommand(command: string): boolean {
  return detectCliAgent(command) !== null;
}

export function isAgentExitCommand(command: string): boolean {
  const t = command.trim().toLowerCase().replace(/^\/+/, "");
  return t === "exit" || t === "quit" || t === "logout";
}
