import { compile, createRenderer, nextTick } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";

/** Mount the real client template while Vitest's node transform supplies the SFC setup. */
export function clientTestComponent<T extends object>(component: T, source: string): T {
  const descriptor = parse(source).descriptor;
  return Object.assign(component, { render: compile(descriptor.template!.content, {
    prefixIdentifiers: true,
    hoistStatic: false,
    bindingMetadata: compileScript(descriptor, { id: "component-test" }).bindings,
  }) });
}

type HostEvent = { target: TestNode };
export type TestNode = {
  tag: string; text: string; value: string; parent: TestNode | null;
  children: TestNode[]; props: Record<string, unknown>; style: Record<string, string>;
  scrollHeight: number; selectionStart: number;
  listeners: Record<string, ((event: HostEvent) => void)[]>;
  addEventListener: (name: string, listener: (event: HostEvent) => void) => void;
  getRootNode: () => object; focus: () => void;
};
export function testNode(tag: string, text = ""): TestNode {
  const result: TestNode = {
    tag, text, value: "", parent: null, children: [], props: {}, listeners: {},
    style: {}, scrollHeight: 40, selectionStart: 0, focus: () => {},
    addEventListener: (name, listener) => { (result.listeners[name] ??= []).push(listener); },
    getRootNode: () => ({}),
  };
  return result;
}
export const testRenderer = createRenderer<TestNode, TestNode>({
  createElement: testNode,
  createText: (text) => testNode("#text", text),
  createComment: () => testNode("#comment"),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, name, _previous, value) => { target.props[name] = value; },
  parentNode: (target) => target.parent,
  nextSibling: (target) => target.parent?.children[target.parent.children.indexOf(target) + 1] ?? null,
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
export function testNodes(root: TestNode): TestNode[] { return [root, ...root.children.flatMap(testNodes)]; }
export function testText(root: TestNode): string { return root.text + root.children.map(testText).join(""); }
export function testButton(root: TestNode, label: string): TestNode {
  const found = testNodes(root).find((item) => item.tag === "button" && testText(item).trim() === label);
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
}
export function testTextarea(root: TestNode): TestNode {
  const found = testNodes(root).find((item) => item.tag === "textarea");
  if (!found) throw new Error("Textarea not found");
  return found;
}
export async function fireTestEvent(target: TestNode, name: "click" | "input") {
  const event = { target };
  for (const listener of target.listeners[name] ?? []) listener(event);
  const handler = target.props[name === "click" ? "onClick" : "onInput"];
  if (typeof handler === "function") await handler(event);
  await nextTick();
}
export async function typeTestText(root: TestNode, value: string) {
  const input = testTextarea(root);
  input.value = value;
  await fireTestEvent(input, "input");
}
