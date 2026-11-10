import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ssrContextKey } from "vue";
import { parse } from "@vue/compiler-sfc";
import StashManager from "./StashManager.vue";
import stashManagerSource from "./StashManager.vue?raw";
import {
  clientTestComponent,
  testButton as button,
  testNode as node,
  testNodes as nodes,
  testRenderer as renderer,
} from "../lib/componentTestRenderer";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const Stashes = clientTestComponent(StashManager, stashManagerSource);
const mounted: { unmount: () => void }[] = [];

async function mountStashManager() {
  const root = node("root");
  const app = renderer.createApp(
    defineComponent(() => () => h(Stashes, { repoRoot: "/repo" })),
  );
  app.provide(ssrContextKey, { modules: new Set() });
  mounted.push(app);
  app.mount(root);
  await Promise.resolve();
  await nextTick();
  return root;
}

beforeEach(() => {
  invoke.mockReset().mockResolvedValue([
    { index: 0, message: "WIP: focus fix", branch: "main", date: "2026-11-10" },
  ]);
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

describe("StashManager keyboard accessibility", () => {
  it("renders explicit button types, valid accent focus rings, and focus-within row visibility", async () => {
    const root = await mountStashManager();
    const buttons = nodes(root).filter((item) => item.tag === "button");
    expect(buttons).toHaveLength(5);
    for (const btn of buttons) {
      expect(btn.props.type).toBe("button");
    }

    for (const label of ["Close", "Stash"]) {
      const classTokens = String(button(root, label).props.class).trim().split(/\s+/);
      expect(classTokens).toContain("focus-visible:ring-2");
      expect(classTokens).toContain("focus-visible:ring-[var(--oterm-accent)]/50");
    }

    expect(button(root, "Apply").props["aria-label"]).toBe("Apply stash 0");
    expect(button(root, "Pop").props["aria-label"]).toBe("Pop stash 0");
    expect(button(root, "Drop").props["aria-label"]).toBe("Drop stash 0");

    const styleContent = parse(stashManagerSource)
      .descriptor.styles.map((style) => style.content)
      .join("\n");
    expect(styleContent).toMatch(
      /\.stash-item:focus-within\s+\.stash-actions\s*\{[^}]*opacity:\s*1/s,
    );
    expect(styleContent).toMatch(
      /\.btn:focus-visible\s*\{[^}]*var\(--oterm-accent\)/s,
    );
  });
});
