import { describe, expect, it } from "vitest";
import {
  isTerminalRowDragBlocked,
  parseGroupSectionId,
  resolveDropBeforeIndex,
  resolveGroupHeader,
  resolveGroupSection,
} from "./useTerminalTabDragReorder";

function mockRect(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    left: 0,
    right: 100,
    width: 100,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockNode(dataset: Record<string, string>, top: number, bottom: number): HTMLElement {
  return {
    dataset,
    getBoundingClientRect: () => mockRect(top, bottom),
  } as HTMLElement;
}

function buildListFixture() {
  const workSection = mockNode({ terminalGroupSection: "g1" }, 0, 200);
  const workHeader = mockNode({ terminalGroupDrop: "g1", groupId: "g1" }, 0, 30);
  const workEntry = mockNode({ terminalTabIndex: "0" }, 40, 90);
  const ungroupedSection = mockNode({ terminalGroupSection: "ungrouped" }, 210, 320);
  const ungroupedEntry = mockNode({ terminalTabIndex: "1" }, 240, 300);

  return {
    querySelectorAll(selector: string) {
      if (selector === "[data-terminal-group-section]") {
        return [workSection, ungroupedSection] as unknown as NodeListOf<HTMLElement>;
      }
      if (selector === "[data-terminal-group-drop]") {
        return [workHeader] as unknown as NodeListOf<HTMLElement>;
      }
      if (selector === "[data-terminal-tab-index]") {
        return [workEntry, ungroupedEntry] as unknown as NodeListOf<HTMLElement>;
      }
      return [] as unknown as NodeListOf<HTMLElement>;
    },
  } as HTMLElement;
}

describe("isTerminalRowDragBlocked", () => {
  function mockElement(tag: string, attrs: Record<string, string> = {}): HTMLElement {
    const el = {
      tagName: tag.toUpperCase(),
      closest(selector: string) {
        if (selector.includes("data-terminal-entry-actions") && attrs.actions) return el;
        if (selector.includes("button") && tag === "button") return el;
        if (selector.includes("term-entry-menu") && attrs.menu) return el;
        if (parent) return parent.closest(selector);
        return null;
      },
    } as unknown as HTMLElement;
    let parent: HTMLElement | null = null;

    const setParent = (p: HTMLElement | null) => {
      parent = p;
    };
    (el as { setParent: (p: HTMLElement | null) => void }).setParent = setParent;
    return el;
  }

  function buildEntryDom() {
    const root = mockElement("div", { menuRoot: "1" });
    const row = mockElement("div");
    const content = mockElement("span");
    const actions = mockElement("div", { actions: "1" });
    const closeBtn = mockElement("button");

    (root as { setParent: (p: HTMLElement | null) => void }).setParent(null);
    (row as { setParent: (p: HTMLElement | null) => void }).setParent(root);
    (content as { setParent: (p: HTMLElement | null) => void }).setParent(row);
    (actions as { setParent: (p: HTMLElement | null) => void }).setParent(row);
    (closeBtn as { setParent: (p: HTMLElement | null) => void }).setParent(actions);

    return { root, row, content, actions, closeBtn };
  }

  it("allows drag from row content even when entry has menu-root wrapper", () => {
    const { content } = buildEntryDom();
    expect(isTerminalRowDragBlocked(content)).toBe(false);
  });

  it("blocks drag from action buttons area", () => {
    const { closeBtn } = buildEntryDom();
    expect(isTerminalRowDragBlocked(closeBtn)).toBe(true);
  });

  it("blocks drag from actions wrapper", () => {
    const { actions } = buildEntryDom();
    expect(isTerminalRowDragBlocked(actions)).toBe(true);
  });
});

describe("parseGroupSectionId", () => {
  it("maps ungrouped and empty values to null", () => {
    expect(parseGroupSectionId("ungrouped")).toBeNull();
    expect(parseGroupSectionId("null")).toBeNull();
    expect(parseGroupSectionId("")).toBeNull();
  });

  it("returns group ids unchanged", () => {
    expect(parseGroupSectionId("g1")).toBe("g1");
  });
});

describe("resolveGroupSection", () => {
  it("returns group id when pointer is over an entry inside a section", () => {
    const listEl = buildListFixture();
    expect(resolveGroupSection(65, listEl)).toBe("g1");
  });

  it("returns null when pointer is over the ungrouped section", () => {
    const listEl = buildListFixture();
    expect(resolveGroupSection(260, listEl)).toBeNull();
  });

  it("returns undefined when pointer is outside all sections", () => {
    const listEl = buildListFixture();
    expect(resolveGroupSection(500, listEl)).toBeUndefined();
  });
});

describe("resolveGroupHeader", () => {
  it("detects when pointer is over a group header band", () => {
    const listEl = buildListFixture();
    expect(resolveGroupHeader(10, listEl)).toBe(true);
    expect(resolveGroupHeader(65, listEl)).toBe(false);
  });
});

describe("resolveDropBeforeIndex", () => {
  it("returns insert index based on tab midpoint", () => {
    const listEl = buildListFixture();
    expect(resolveDropBeforeIndex(50, listEl)).toBe(0);
    expect(resolveDropBeforeIndex(250, listEl)).toBe(1);
    expect(resolveDropBeforeIndex(310, listEl)).toBe(2);
  });
});
