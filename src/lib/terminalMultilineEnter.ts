/** Shown by agy (and similar TUIs) before the confirming Ctrl+D on Windows ConPTY. */
const AGENT_EXIT_CONFIRM_PROMPT = /press ctrl\+d again to exit/i;

export function isAgentExitConfirmPrompt(data: string): boolean {
  return AGENT_EXIT_CONFIRM_PROMPT.test(data);
}

/** agy accepts /quit at the confirm step; a second EOT byte often does not exit on ConPTY. */
const AGENT_EXIT_CONFIRM_PAYLOAD = "/quit\r";

export function getCtrlDEofPayload(event: KeyboardEvent): string | null {
  if (event.type !== "keydown") return null;
  if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return null;
  if (event.key.toLowerCase() !== "d") return null;
  return "\x04";
}

export function resolveCtrlDTerminalPayload(exitConfirmPending: boolean): string {
  return exitConfirmPending ? AGENT_EXIT_CONFIRM_PAYLOAD : "\x04";
}

export function getMultilineEnterPayload(event: KeyboardEvent): string | null {
  if (event.type !== "keydown" || event.key !== "Enter") return null;
  if (event.altKey || event.metaKey) return null;
  if (!event.shiftKey && !event.ctrlKey) return null;
  return "\n";
}

/** xterm sends BS (\\b) for Ctrl+Backspace; readline/PSReadLine expect Ctrl+W for backward word kill. */
export function getCtrlBackspaceWordDeletePayload(event: KeyboardEvent): string | null {
  if (event.type !== "keydown") return null;
  if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return null;
  if (event.key !== "Backspace") return null;
  return "\x17";
}

export function getPtyKeyOverride(event: KeyboardEvent): string | null {
  return (
    getCtrlDEofPayload(event) ??
    getMultilineEnterPayload(event) ??
    getCtrlBackspaceWordDeletePayload(event)
  );
}

function isAgentComposerTarget(target: HTMLElement | null): boolean {
  if (!target || typeof target.closest !== "function") return false;
  return Boolean(target.closest(".agent-composer"));
}

/** Route PTY overrides when the pane is active, even if xterm lost focus after a TUI redraw. */
export function shouldForwardPtyKeyOverride(
  event: KeyboardEvent,
  active: boolean,
  terminalContainer: HTMLElement | null,
): boolean {
  if (!active || event.type !== "keydown") return false;
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  if (isAgentComposerTarget(target)) return false;

  if (terminalContainer?.contains(target)) {
    return true;
  }

  if (
    typeof document !== "undefined" &&
    (target === document.body || target === document.documentElement)
  ) {
    return true;
  }

  return false;
}
