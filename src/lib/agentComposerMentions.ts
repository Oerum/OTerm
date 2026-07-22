export interface MentionMatch {
  start: number;
  end: number;
  query: string;
}

export interface MentionInsertResult {
  text: string;
  newCursorIndex: number;
}

/**
 * Detects if the cursor in a text string is currently inside or right after an `@` mention query.
 * Matches `@query` where `@` is at position 0 or preceded by whitespace/bracket/quote,
 * and no whitespace exists between `@` and cursorIndex.
 */
export function detectMentionQuery(
  text: string,
  cursorIndex: number,
): MentionMatch | null {
  if (cursorIndex < 0 || cursorIndex > text.length) return null;

  const textBeforeCursor = text.slice(0, cursorIndex);
  const lastAt = textBeforeCursor.lastIndexOf("@");
  if (lastAt < 0) return null;

  // Ensure `@` is at start of string or preceded by whitespace/boundary characters
  if (lastAt > 0) {
    const prevChar = textBeforeCursor[lastAt - 1];
    if (!/[\s\(\[\{\"'<,]/.test(prevChar)) {
      return null;
    }
  }

  const query = textBeforeCursor.slice(lastAt + 1);

  // If query contains whitespace or newlines, trigger is cancelled
  if (/[\s\n\r]/.test(query)) {
    return null;
  }

  return {
    start: lastAt,
    end: cursorIndex,
    query,
  };
}

/**
 * Normalizes an absolute or relative path by converting backslashes to forward slashes,
 * and making it relative to rootCwd if applicable.
 */
export function formatMentionPath(path: string, rootCwd?: string): string {
  let normalized = path.replace(/\\/g, "/");

  if (rootCwd) {
    let normalizedRoot = rootCwd.replace(/\\/g, "/");
    if (!normalizedRoot.endsWith("/")) {
      normalizedRoot += "/";
    }
    if (normalized.startsWith(normalizedRoot)) {
      normalized = normalized.slice(normalizedRoot.length);
    } else if (normalized === rootCwd.replace(/\\/g, "/")) {
      normalized = ".";
    }
  }

  return normalized;
}

/**
 * Inserts a selected mention path into text at the active `@` query range.
 */
export function insertMentionText(
  text: string,
  cursorIndex: number,
  mentionPath: string,
  rootCwd?: string,
): MentionInsertResult {
  const match = detectMentionQuery(text, cursorIndex);
  const cleanPath = formatMentionPath(mentionPath, rootCwd);
  const formattedMention = cleanPath.includes(" ") ? `@"${cleanPath}"` : `@${cleanPath}`;

  if (!match) {
    // Fallback if no match detected: append at cursor
    const prefix = cursorIndex > 0 && !text.slice(0, cursorIndex).endsWith(" ") ? " " : "";
    const insertion = prefix + formattedMention + " ";
    const newText = text.slice(0, cursorIndex) + insertion + text.slice(cursorIndex);
    return {
      text: newText,
      newCursorIndex: cursorIndex + insertion.length,
    };
  }

  const before = text.slice(0, match.start);
  const after = text.slice(match.end);
  const insertion = formattedMention + " ";
  const newText = before + insertion + after;

  return {
    text: newText,
    newCursorIndex: match.start + insertion.length,
  };
}
