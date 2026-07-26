/** Decide whether a anchored menu should open upward from `anchor`. */
export function shouldOpenMenuUpward(anchor: HTMLElement, minSpaceBelow: number): boolean {
  const rect = anchor.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  return spaceBelow < minSpaceBelow && rect.top > spaceBelow;
}
