export interface WordDiffChunk {
  type: "added" | "removed" | "common";
  text: string;
}

/**
 * Computes word-level diffs using a Longest Common Subsequence (LCS) algorithm.
 * Pairs matching words and isolates differences.
 */
export function diffWords(oldStr: string, newStr: string): { oldChunks: WordDiffChunk[]; newChunks: WordDiffChunk[] } {
  // Split strings into words, whitespace, and punctuation.
  const regex = /(\s+|[a-zA-Z0-9_]+|[^a-zA-Z0-9_\s])/g;
  const oldWords = oldStr.match(regex) || [];
  const newWords = newStr.match(regex) || [];

  const m = oldWords.length;
  const n = newWords.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const oldChunks: WordDiffChunk[] = [];
  const newChunks: WordDiffChunk[] = [];

  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      const txt = oldWords[i - 1];
      oldChunks.unshift({ type: "common", text: txt });
      newChunks.unshift({ type: "common", text: txt });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      newChunks.unshift({ type: "added", text: newWords[j - 1] });
      j--;
    } else {
      oldChunks.unshift({ type: "removed", text: oldWords[i - 1] });
      i--;
    }
  }

  return { oldChunks, newChunks };
}
