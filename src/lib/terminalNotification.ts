import type { CliAgentId } from "./terminalAgentMode";

export interface NotificationFocusContext {
  paneActive: boolean;
  tabActive: boolean;
  activeAgentId: CliAgentId | null;
  awaitingOutputSinceFocus: boolean;
}

export function isPaneFocused(ctx: Pick<NotificationFocusContext, "paneActive" | "tabActive">): boolean {
  return ctx.paneActive && ctx.tabActive;
}

export function containsBell(data: string): boolean {
  return data.includes("\x07");
}

/** Common terminal notify OSC sequences (iTerm 777, urxvt 9, generic 99). */
export function containsOscNotification(data: string): boolean {
  return /\x1b\]777;|\x1b\]9;|\x1b\]99;/.test(data);
}

export function shouldMarkUnseenFromExplicitSignal(ctx: NotificationFocusContext): boolean {
  return !isPaneFocused(ctx);
}

export function shouldMarkUnseenFromPrompt(
  ctx: NotificationFocusContext,
  completedAgentId?: CliAgentId | null,
): boolean {
  if (isPaneFocused(ctx)) return false;
  return Boolean(
    ctx.activeAgentId || completedAgentId || ctx.awaitingOutputSinceFocus,
  );
}

export function shouldMarkUnseenFromOutput(ctx: NotificationFocusContext): boolean {
  if (isPaneFocused(ctx)) return false;
  return ctx.awaitingOutputSinceFocus;
}
