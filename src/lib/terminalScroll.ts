export function shouldShowScrollToBottom(
  viewportY: number,
  baseY: number,
): boolean {
  return viewportY < baseY;
}
