export function handleMenuNavigationKey(
  event: KeyboardEvent,
  enabled: number[],
  currentFocusIndex: number,
  onFocus: (nextIndex: number) => void,
): boolean {
  if (enabled.length === 0) return false;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    const pos = enabled.indexOf(currentFocusIndex);
    const next = pos === -1 || pos === enabled.length - 1 ? enabled[0]! : enabled[pos + 1]!;
    onFocus(next);
    return true;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    const pos = enabled.indexOf(currentFocusIndex);
    const next = pos <= 0 ? enabled[enabled.length - 1]! : enabled[pos - 1]!;
    onFocus(next);
    return true;
  }

  if (event.key === "Home") {
    event.preventDefault();
    const next = enabled[0]!;
    onFocus(next);
    return true;
  }

  if (event.key === "End") {
    event.preventDefault();
    const next = enabled[enabled.length - 1]!;
    onFocus(next);
    return true;
  }

  return false;
}

export function handleMenuKeyDown<T extends { id: string; disabled?: boolean }>(
  event: KeyboardEvent,
  options: {
    open: boolean;
    enabledIndices: number[];
    focusIndex: number;
    items: T[];
    onClose: () => void;
    onFocus: (index: number) => void;
    onRun: (id: string) => void;
  },
): boolean {
  if (!options.open) return false;

  if (event.key === "Escape") {
    event.preventDefault();
    options.onClose();
    return true;
  }

  const enabled = options.enabledIndices;
  if (enabled.length === 0) return false;

  if (
    handleMenuNavigationKey(event, enabled, options.focusIndex, options.onFocus)
  ) {
    return true;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    const item = options.items[options.focusIndex];
    if (item && !item.disabled) options.onRun(item.id);
    return true;
  }

  return false;
}
