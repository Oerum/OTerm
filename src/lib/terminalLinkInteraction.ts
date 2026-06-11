import { isHttpUrl } from "./terminalPaths";

export type ModifierMouseLikeEvent = Pick<MouseEvent, "ctrlKey" | "metaKey">;

export function shouldEnableTerminalPathInteractions(tuiModeActive: boolean): boolean {
  return !tuiModeActive;
}

export type TerminalLinkCtrlClickAction = "open-url" | "append-to-prompt" | "none";

export function resolveTerminalLinkCtrlClickAction(
  event: ModifierMouseLikeEvent,
  linkText: string,
): TerminalLinkCtrlClickAction {
  if (!event.ctrlKey && !event.metaKey) return "none";
  if (isHttpUrl(linkText)) return "open-url";
  return "append-to-prompt";
}
