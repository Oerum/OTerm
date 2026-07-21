export type OTermChromeTokens = {
  bg: string;
  panel: string;
  elevated: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
};

const CHROME_VARS: Array<[keyof OTermChromeTokens, string]> = [
  ["bg", "--oterm-bg"],
  ["panel", "--oterm-panel"],
  ["elevated", "--oterm-elevated"],
  ["text", "--oterm-text"],
  ["muted", "--oterm-muted"],
  ["accent", "--oterm-accent"],
  ["border", "--oterm-border"],
];

export function applyChromeTheme(
  tokens: OTermChromeTokens | null,
  root: HTMLElement = document.documentElement,
): void {
  for (const [key, cssVar] of CHROME_VARS) {
    if (!tokens) {
      root.style.removeProperty(cssVar);
    } else {
      root.style.setProperty(cssVar, tokens[key]);
    }
  }
}

/** Derive simple chrome tokens from a terminal theme background/foreground/cursor. */
export function chromeTokensFromTerminalColors(input: {
  background?: string;
  foreground?: string;
  cursor?: string;
}): OTermChromeTokens | null {
  const bg = input.background && input.background !== "transparent" ? input.background : null;
  const text = input.foreground ?? null;
  const accent = input.cursor ?? null;
  if (!bg || !text || !accent) return null;
  return {
    bg,
    panel: bg,
    elevated: bg,
    text,
    muted: text,
    accent,
    border: text,
  };
}
