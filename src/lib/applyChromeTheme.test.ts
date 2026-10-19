import { describe, expect, it } from "vitest";
import { applyChromeTheme, chromeTokensFromTerminalColors } from "./applyChromeTheme";

function fakeRoot(): HTMLElement {
  const props = new Map<string, string>();
  return {
    style: {
      setProperty(key: string, value: string) {
        props.set(key, value);
      },
      removeProperty(key: string) {
        props.delete(key);
      },
      getPropertyValue(key: string) {
        return props.get(key) ?? "";
      },
    },
  } as unknown as HTMLElement;
}

describe("applyChromeTheme", () => {
  it("sets and clears chrome CSS variables", () => {
    const root = fakeRoot();
    const tokens = {
      bg: "#282a36",
      panel: "#21222c",
      elevated: "#343746",
      text: "#f8f8f2",
      muted: "#6272a4",
      accent: "#bd93f9",
      border: "#44475a",
    };
    applyChromeTheme(tokens, root);
    expect(root.style.getPropertyValue("--oterm-bg")).toBe("#282a36");
    expect(root.style.getPropertyValue("--oterm-accent")).toBe("#bd93f9");
    expect(root.style.getPropertyValue("--oterm-surface")).toBe("#343746");
    expect(root.style.getPropertyValue("--oterm-titlebar")).toBe(tokens.bg);
    expect(root.style.getPropertyValue("--oterm-sidebar")).toBe(tokens.bg);
    expect(root.style.getPropertyValue("--oterm-border-strong")).toBe(tokens.border);
    expect(root.style.getPropertyValue("--oterm-line")).toBe(tokens.border);
    expect(root.style.getPropertyValue("--oterm-accent-dim")).toBe(
      "color-mix(in srgb, #bd93f9 12%, transparent)",
    );
    expect(root.style.getPropertyValue("--oterm-faint")).toBe(
      "color-mix(in srgb, #f8f8f2 60%, #282a36)",
    );
    applyChromeTheme(null, root);
    expect(root.style.getPropertyValue("--oterm-bg")).toBe("");
    expect(root.style.getPropertyValue("--oterm-titlebar")).toBe("");
    expect(root.style.getPropertyValue("--oterm-sidebar")).toBe("");
    expect(root.style.getPropertyValue("--oterm-border-strong")).toBe("");
    expect(root.style.getPropertyValue("--oterm-line")).toBe("");
    expect(root.style.getPropertyValue("--oterm-surface")).toBe("");
    expect(root.style.getPropertyValue("--oterm-accent-dim")).toBe("");
    expect(root.style.getPropertyValue("--oterm-faint")).toBe("");
  });

  it("keeps light custom-theme chrome and secondary surfaces on the selected background", () => {
    const root = fakeRoot();
    const tokens = chromeTokensFromTerminalColors({ background: "#ffffff", foreground: "#111111", cursor: "#006644" })!;
    applyChromeTheme(tokens, root);
    for (const name of ["bg", "titlebar", "sidebar", "panel", "elevated", "surface"]) {
      expect(root.style.getPropertyValue(`--oterm-${name}`)).toBe("#ffffff");
    }
    expect(root.style.getPropertyValue("--oterm-text")).toBe("#111111");
    expect(root.style.getPropertyValue("--oterm-border-strong")).toBe(tokens.border);
    expect(root.style.getPropertyValue("--oterm-faint")).toBe("color-mix(in srgb, #111111 60%, #ffffff)");
  });

  it("derives tokens from terminal colors when background is opaque", () => {
    const tokens = chromeTokensFromTerminalColors({
      background: "#002b36",
      foreground: "#839496",
      cursor: "#93a1a1",
    });
    expect(tokens?.bg).toBe("#002b36");
    expect(tokens?.panel).toBe("#002b36");
    expect(tokens?.elevated).toBe("#002b36");
    expect(chromeTokensFromTerminalColors({ background: "transparent" })).toBeNull();
  });
});
