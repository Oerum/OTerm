// ponytail: subsequence + substring only; no typo tolerance. Upgrade: add fuzzy lib if users complain about typos.

export function scoreCommandPaletteMatch(
  query: string,
  label: string,
  keywords = "",
): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;

  const labelL = label.toLowerCase();
  const keywordsL = keywords.toLowerCase();
  const hay = `${labelL} ${keywordsL}`;

  const idx = labelL.indexOf(q);
  if (idx >= 0) {
    // Prefer prefix and earlier matches
    return 1000 - idx + Math.min(labelL.length, 50);
  }
  if (keywordsL.includes(q) || hay.includes(q)) {
    return 100;
  }
  // Contiguous subsequence across label (simple)
  if (isSubsequence(q, labelL)) return 10;
  if (isSubsequence(q, hay)) return 5;
  return 0;
}

function isSubsequence(q: string, s: string): boolean {
  let i = 0;
  for (const ch of s) {
    if (ch === q[i]) i++;
    if (i >= q.length) return true;
  }
  return false;
}

export function filterCommandPaletteItems<T extends { label: string; keywords?: string }>(
  query: string,
  items: T[],
): T[] {
  const scored = items
    .map((item) => ({
      item,
      score: scoreCommandPaletteMatch(query, item.label, item.keywords ?? ""),
    }))
    .filter((row) => row.score > 0);
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.label.localeCompare(b.item.label);
  });
  return scored.map((row) => row.item);
}
