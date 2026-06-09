import type { CliAgentId } from "./terminalAgentMode";
import { isAgentExitConfirmPrompt } from "./terminalMultilineEnter";
import {
  detectTrailingShellPrompt,
  looksLikeTuiTransition,
} from "./terminalPrompt";

export interface AgentExitHandshakeState {
  activeAgentId: CliAgentId | null;
  agentExitConfirmPending: boolean;
  promptClearSuppressUntil?: number;
}

export interface AgentExitHandshakeResult extends AgentExitHandshakeState {
  trailingPrompt: { cwd: string } | null;
}

const AGENT_LAUNCH_PROMPT_CLEAR_SUPPRESS_MS = 2500;

export function agentLaunchPromptClearSuppressUntil(
  now = Date.now(),
): number {
  return now + AGENT_LAUNCH_PROMPT_CLEAR_SUPPRESS_MS;
}

/** PTY output ordering: detect exit confirm before prompt-based badge clear. */
export function applyAgentExitHandshakeFromOutput(
  data: string,
  state: AgentExitHandshakeState,
): AgentExitHandshakeResult {
  let { activeAgentId, agentExitConfirmPending } = state;
  const promptClearSuppressUntil = state.promptClearSuppressUntil ?? 0;

  if (isAgentExitConfirmPrompt(data)) {
    agentExitConfirmPending = true;
  }

  const trailingPrompt = detectTrailingShellPrompt(data);
  if (
    trailingPrompt &&
    activeAgentId &&
    !agentExitConfirmPending &&
    !looksLikeTuiTransition(data) &&
    Date.now() >= promptClearSuppressUntil
  ) {
    activeAgentId = null;
  }

  return {
    activeAgentId,
    agentExitConfirmPending,
    promptClearSuppressUntil,
    trailingPrompt,
  };
}
