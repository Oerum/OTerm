import { getSetting, setSetting } from "./settingsStore";

export type KeybindAction =
  | "terminal-new"
  | "terminal-new-ungrouped"
  | "terminal-reopen"
  | "command-palette"
  | "history-palette"
  | "reload-window"
  | "dictation"
  | "tab-cycle"
  | "terminal-set-default"
  | "file-save"
  | "focus-branch-filter"
  | "navigate-parent-commit"
  | "navigate-child-commit"
  | "refresh"
  | "delete-item"
  | "composer-toggle"
  | "toggle-sidebar"
  | "toggle-tools"
  | "toggle-source-control"
  | "toggle-agent-ops"
  | "split-horizontal"
  | "close-tab";

export const ALL_KEYBIND_ACTIONS: KeybindAction[] = [
  "terminal-new",
  "terminal-new-ungrouped",
  "terminal-reopen",
  "command-palette",
  "history-palette",
  "reload-window",
  "dictation",
  "tab-cycle",
  "terminal-set-default",
  "file-save",
  "focus-branch-filter",
  "navigate-parent-commit",
  "navigate-child-commit",
  "refresh",
  "delete-item",
  "composer-toggle",
  "toggle-sidebar",
  "toggle-tools",
  "toggle-source-control",
  "toggle-agent-ops",
  "split-horizontal",
  "close-tab",
];

export interface Keybind {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  key: string;
}

const defaultKeybinds: Record<KeybindAction, Keybind> = {
  "terminal-new": { ctrl: true, shift: true, key: "t" },
  "terminal-new-ungrouped": { ctrl: true, shift: true, alt: true, key: "t" },
  "terminal-reopen": { ctrl: true, alt: true, key: "t" },
  "command-palette": { ctrl: true, key: "k" },
  "history-palette": { ctrl: true, key: "r" },
  "reload-window": { ctrl: true, shift: true, key: "r" },
  dictation: { ctrl: true, key: "f" },
  "tab-cycle": { ctrl: true, key: "Tab" }, // Actually we check ctrl || meta in appKeyboardShortcuts
  "terminal-set-default": { ctrl: true, key: "d" },
  "file-save": { ctrl: true, key: "s" },
  "focus-branch-filter": { key: "/" },
  "navigate-parent-commit": { alt: true, key: "PageUp" },
  "navigate-child-commit": { alt: true, key: "PageDown" },
  refresh: { key: "F5" },
  "delete-item": { key: "Delete" },
  "composer-toggle": { ctrl: true, shift: true, key: "Enter" },
  "toggle-sidebar": { ctrl: true, shift: true, key: "b" },
  "toggle-tools": { ctrl: true, shift: true, key: "e" },
  "toggle-source-control": { ctrl: true, shift: true, key: "g" },
  "toggle-agent-ops": { ctrl: true, shift: true, key: "a" },
  "split-horizontal": { ctrl: true, shift: true, key: "d" },
  "close-tab": { ctrl: true, shift: true, key: "w" },
};

export function getKeybind(action: KeybindAction): Keybind {
  const raw = getSetting(`oterm:keybind:${action}`);
  if (!raw) return defaultKeybinds[action];
  try {
    const parsed = JSON.parse(raw);
    return { ...defaultKeybinds[action], ...parsed };
  } catch {
    return defaultKeybinds[action];
  }
}

export async function setKeybind(action: KeybindAction, keybind: Keybind): Promise<void> {
  await setSetting(`oterm:keybind:${action}`, JSON.stringify(keybind));
}

export function formatKeybind(bind: Keybind): string {
  const parts: string[] = [];
  if (bind.ctrl) parts.push("Ctrl");
  if (bind.meta) parts.push("Cmd");
  if (bind.alt) parts.push("Alt");
  if (bind.shift) parts.push("Shift");

  let keyStr = bind.key;
  if (keyStr.length === 1) keyStr = keyStr.toUpperCase();
  else if (keyStr === " ") keyStr = "Space";
  
  parts.push(keyStr);
  return parts.join("+");
}

export function parseKeyboardEventToKeybind(event: KeyboardEvent): Keybind | null {
  // Ignore modifiers-only presses
  if (["Control", "Shift", "Alt", "Meta", "Escape"].includes(event.key)) {
    return null;
  }
  
  return {
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
    key: event.key, // Or maybe we should normalize event.code / event.key? event.key is fine
  };
}

export function isActionKeybind(event: KeyboardEvent, action: KeybindAction): boolean {
  const bind = getKeybind(action);

  // For tab cycle default, we might have historical reasons allowing metaKey. 
  // But let's stick to strict matching to allow users to override exactly.
  
  const evCtrl = event.ctrlKey;
  const evAlt = event.altKey;
  const evShift = event.shiftKey;
  const evMeta = event.metaKey;
  const evKey = event.key.toLowerCase();

  const bCtrl = !!bind.ctrl;
  const bAlt = !!bind.alt;
  const bShift = !!bind.shift;
  const bMeta = !!bind.meta;
  const bKey = bind.key.toLowerCase();

  return (
    evCtrl === bCtrl &&
    evAlt === bAlt &&
    evShift === bShift &&
    evMeta === bMeta &&
    evKey === bKey
  );
}

