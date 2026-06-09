const OSC_TITLE_MAX_LENGTH = 120;

export function normalizeOscTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  if (trimmed.length <= OSC_TITLE_MAX_LENGTH) return trimmed;
  return trimmed.slice(0, OSC_TITLE_MAX_LENGTH);
}
