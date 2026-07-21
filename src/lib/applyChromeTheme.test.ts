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
    applyChromeTheme(null, root);
    expect(root.style.getPropertyValue("--oterm-bg")).toBe("");
  });

  it("derives tokens from terminal colors when background is opaque", () => {
    const tokens = chromeTokensFromTerminalColors({
      background: "#002b36",
      foreground: "#839496",
      cursor: "#93a1a1",
    });
    expect(tokens?.bg).toBe("#002b36");
    expect(chromeTokensFromTerminalColors({ background: "transparent" })).toBeNull();
  });
});
