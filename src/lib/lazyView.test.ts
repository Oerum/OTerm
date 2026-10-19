import { afterEach, describe, expect, it, vi } from "vitest";
import { createRenderer, defineComponent, h, nextTick, ref } from "vue";
import { defineLazyView } from "./lazyView";

const toast = vi.hoisted(() => vi.fn());
vi.mock("./appToast", () => ({ pushAppToast: toast }));

type HostNode = { text: string; parent: HostNode | null; children: HostNode[] };
const node = (text = ""): HostNode => ({ text, parent: null, children: [] });
const renderer = createRenderer<HostNode, HostNode>({
  createElement: node,
  createText: node,
  createComment: node,
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; },
  patchProp: () => {},
  parentNode: (target) => target.parent,
  nextSibling: (target) => {
    const siblings = target.parent?.children;
    return siblings?.[siblings.indexOf(target) + 1] ?? null;
  },
  insert: (target, parent, anchor) => {
    const previous = target.parent?.children;
    if (previous) previous.splice(previous.indexOf(target), 1);
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, target);
    target.parent = parent;
  },
  remove: (target) => {
    const siblings = target.parent?.children;
    if (siblings) siblings.splice(siblings.indexOf(target), 1);
    target.parent = null;
  },
});
const mounted: { unmount: () => void }[] = [];
const LoadedView = defineComponent({
  emits: ["close"],
  setup(_props, { emit, expose }) {
    expose({ close: () => emit("close") });
    return () => h("div", "Loaded");
  },
});

async function settle() {
  for (let tick = 0; tick < 8; tick++) {
    await Promise.resolve();
    await nextTick();
  }
}

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  vi.clearAllMocks();
});

describe("lazy view failure recovery through Vue", () => {
  it("cancels a pending decision explicitly and retries only when reopened", async () => {
    const open = ref(true);
    let resolve!: (value: string) => void;
    const decision = new Promise<string>((done) => { resolve = done; });
    const pendingDecision = (async () => {
      const result = await decision;
      open.value = false;
      return result;
    })();
    const cancelEvent = vi.fn();
    const failure = vi.fn(() => resolve("cancel"));
    const loader = vi.fn<() => Promise<typeof LoadedView>>()
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockResolvedValue(LoadedView);
    const View = defineLazyView(loader, "Push Default Branch Dialog", failure);
    const app = renderer.createApp(defineComponent(() => () =>
      open.value ? h(View, { onCancel: cancelEvent }) : null));
    mounted.push(app); app.mount(node()); await settle();
    expect(await pendingDecision).toBe("cancel");
    expect(failure).toHaveBeenCalledOnce();
    expect(cancelEvent).not.toHaveBeenCalled();
    expect(loader).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenCalledExactlyOnceWith(
      "Failed to load Push Default Branch Dialog. Reopen it to try again.", "error",
    );
    open.value = true; await settle();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(failure).toHaveBeenCalledOnce();
  });

  it("rejects a pending SSH secret request when its prompt cannot load", async () => {
    const open = ref(true);
    let reject!: (error: Error) => void;
    const secret = new Promise<string>((_resolve, fail) => { reject = fail; });
    const rejected = expect(secret).rejects.toThrow("Cancelled");
    const failure = vi.fn(() => { open.value = false; reject(new Error("Cancelled")); });
    const View = defineLazyView(async () => { throw new Error("chunk unavailable"); }, "SSH Secret Prompt", failure);
    const app = renderer.createApp(defineComponent(() => () => open.value ? h(View) : null));
    mounted.push(app); app.mount(node()); await settle(); await rejected;
    expect(open.value).toBe(false); expect(failure).toHaveBeenCalledOnce();
  });

  it("preserves the loaded component's exposed ref and normal close event", async () => {
    const view = ref<{ close: () => void } | null>(null);
    const close = vi.fn();
    const View = defineLazyView(async () => LoadedView, "View", vi.fn());
    const app = renderer.createApp(defineComponent(() => () => h(View, { ref: view, onClose: close })));
    mounted.push(app); app.mount(node()); await settle();
    expect(view.value).not.toBeNull(); view.value!.close();
    expect(close).toHaveBeenCalledOnce();
    expect(toast).not.toHaveBeenCalled();
  });
});
