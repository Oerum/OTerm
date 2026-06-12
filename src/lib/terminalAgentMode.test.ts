import { describe, expect, it } from "vitest";
import {
  CLI_AGENTS,
  detectCliAgent,
  isAgentExitCommand,
  isAgentLaunchCommand,
  type CliAgentId,
} from "./terminalAgentMode";

const oterm_AGENT_IDS: CliAgentId[] = [
  "claude",
  "gemini",
  "codex",
  "opencode",
  "copilot",
  "cursor",
  "amp",
  "droid",
  "pi",
  "auggie",
  "goose",
  "hermes",
  "vibe",
];

describe("detectCliAgent", () => {
  it("recognizes every registered CLI agent by direct command", () => {
    for (const agent of CLI_AGENTS) {
      for (const prefix of agent.commandPrefixes) {
        expect(detectCliAgent(prefix)).toBe(agent.id);
        expect(detectCliAgent(`  ${prefix}  --help`)).toBe(agent.id);
      }
    }
  });

  it("covers all oterm agents plus agy", () => {
    const ids = new Set(CLI_AGENTS.map((agent) => agent.id));
    for (const id of oterm_AGENT_IDS) {
      expect(ids.has(id)).toBe(true);
    }
    expect(ids.has("agy")).toBe(true);
    expect(ids.size).toBe(oterm_AGENT_IDS.length + 1);
  });

  it("maps vibe-acp to vibe", () => {
    expect(detectCliAgent("vibe-acp")).toBe("vibe");
    expect(detectCliAgent("vibe-acp run")).toBe("vibe");
  });

  it("maps Cursor CLI agent command to cursor", () => {
    expect(detectCliAgent("agent")).toBe("cursor");
    expect(detectCliAgent("agent --resume")).toBe("cursor");
  });

  it("detects package runner invocations", () => {
    expect(detectCliAgent("npx @anthropic-ai/claude-code")).toBe("claude");
    expect(detectCliAgent("npx @openai/codex")).toBe("codex");
    expect(detectCliAgent("pnpm dlx opencode")).toBe("opencode");
    expect(detectCliAgent("bunx @sourcegraph/amp")).toBe("amp");
    expect(detectCliAgent("bun agy")).toBe("agy");
  });

  it("prefers the launched package over later provider/model flags", () => {
    expect(detectCliAgent("bun agy --model gemini")).toBe("agy");
    expect(detectCliAgent("npx agy run --provider gemini")).toBe("agy");
  });

  it("returns null for normal shell commands", () => {
    expect(detectCliAgent("git status")).toBeNull();
    expect(detectCliAgent("npm install")).toBeNull();
    expect(detectCliAgent("echo hello")).toBeNull();
    expect(detectCliAgent("")).toBeNull();
  });

  it("keeps isAgentLaunchCommand in sync with detectCliAgent", () => {
    expect(isAgentLaunchCommand("claude")).toBe(true);
    expect(isAgentLaunchCommand("ls")).toBe(false);
    expect(isAgentLaunchCommand("npx codex")).toBe(true);
  });

  it("assigns logo files for oterm agents with bundled assets", () => {
    const withLogo = [
      "claude",
      "gemini",
      "codex",
      "opencode",
      "copilot",
      "cursor",
      "amp",
      "droid",
      "pi",
      "auggie",
      "goose",
      "agy",
    ] as const;
    for (const id of withLogo) {
      const agent = CLI_AGENTS.find((entry) => entry.id === id);
      expect(agent?.logoFile).toBeTruthy();
    }
  });

  it("uses initial fallback for agents without bundled logos", () => {
    for (const id of ["hermes", "vibe"] as const) {
      const agent = CLI_AGENTS.find((entry) => entry.id === id);
      expect(agent?.logoFile).toBeNull();
    }
  });
});

describe("isAgentExitCommand", () => {
  it("recognizes slash-prefixed quit commands", () => {
    expect(isAgentExitCommand("/quit")).toBe(true);
    expect(isAgentExitCommand("quit")).toBe(true);
    expect(isAgentExitCommand("exit")).toBe(true);
    expect(isAgentExitCommand("agy")).toBe(false);
  });
});
