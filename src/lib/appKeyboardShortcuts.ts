import { getKeybind, isActionKeybind } from "./keybindSettings";

export function isTabCycleShortcut(event: KeyboardEvent): boolean {
  const bind = getKeybind("tab-cycle");
  const evKey = event.key.toLowerCase();
  const bKey = bind.key.toLowerCase();
  if (evKey !== bKey) return false;

  const matchesCtrl = event.ctrlKey && bind.ctrl;
  const matchesMeta = event.metaKey && bind.meta;
  const matchesAlt = event.altKey && bind.alt;

  const isDefaultCtrl = bind.ctrl && !bind.meta && !bind.alt;
  const matchesFallback = isDefaultCtrl && (event.ctrlKey || event.metaKey) && !event.altKey;

  return Boolean(matchesCtrl || matchesMeta || matchesAlt || matchesFallback);
}

export function isDictationShortcut(event: KeyboardEvent): boolean {
  return isActionKeybind(event, "dictation");
}

export function isCommandPaletteShortcut(event: KeyboardEvent): boolean {
  const bind = getKeybind("command-palette");
  const isDefault =
    !!bind.ctrl && !bind.meta && !bind.alt && !bind.shift && bind.key.toLowerCase() === "k";
  if (isDefault) {
    const key = event.key.toLowerCase();
    if (key !== "k") return false;
    if (event.shiftKey || event.altKey) return false;
    return event.ctrlKey || event.metaKey;
  }
  return isActionKeybind(event, "command-palette");
}

export function consumeAppShortcut(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}
