export function isTabCycleShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && event.key === "Tab";
}

export function isDictationShortcut(event: KeyboardEvent): boolean {
  return (
    event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    event.key.toLowerCase() === "f"
  );
}

export function consumeAppShortcut(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}
