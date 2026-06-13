import { CLI_AGENTS, type CliAgentId } from "./terminalAgentMode";

const KNOWN_AGENT_IDS = new Set<CliAgentId>(CLI_AGENTS.map((agent) => agent.id));

export function parseDetectedCliAgentId(
  detectedId: string | null | undefined,
): CliAgentId | null {
  if (!detectedId) return null;
  return KNOWN_AGENT_IDS.has(detectedId as CliAgentId)
    ? (detectedId as CliAgentId)
    : null;
}

/** Promote shell mode to agent mode when the process tree shows an agent. */
export function reconcileActiveAgentId(
  localId: CliAgentId | null,
  detectedId: CliAgentId | null,
): CliAgentId | null {
  if (localId) return localId;
  return detectedId;
}
