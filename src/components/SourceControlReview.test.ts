import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, reactive, ssrContextKey } from "vue";
import SourceControlReview from "./SourceControlReview.vue";
import reviewSource from "./SourceControlReview.vue?raw";
import type { SelectedGitFile } from "../types/git";
import type { SourceControlReviewDraft, SourceControlReviewRange } from "../lib/sourceControlAgent";
import { _resetCommitDraftsForTests, getSourceControlReviewDraft, setSourceControlReviewDraft } from "../lib/sourceControlDrafts";
import {
  clientTestComponent, fireTestEvent as fire, testButton as button, testNode as node,
  testRenderer as renderer, testText as text, testTextarea as textarea, typeTestText as type,
} from "../lib/componentTestRenderer";

const { clipboard, toast } = vi.hoisted(() => ({ clipboard: vi.fn(), toast: vi.fn() }));
vi.mock("../lib/clipboard", () => ({ writeClipboardText: clipboard }));
vi.mock("../lib/appToast", () => ({ pushAppToast: toast }));

const Review = clientTestComponent(SourceControlReview, reviewSource);
const mounted: { unmount: () => void }[] = [];
const file: SelectedGitFile = { path: "src/a.ts", staged: false, untracked: false };
const range: SourceControlReviewRange = { side: "old", start: 3, end: 4, hunkHeader: "@@ -3,2 +3,2 @@", excerpt: "old\ntext" };
function savedDraft(): SourceControlReviewDraft {
  return {
    comments: [{ id: "one", file: { ...file }, range: null, body: "Saved note" }],
    editor: { id: null, file: null, range: null, body: "" },
  };
}
function mountReview(overrides: { selectedFile?: SelectedGitFile | null; agentName?: string | null; agentHandoffBusy?: boolean } = {}) {
  const props = reactive({
    scopeKey: "pane:a", repoRoot: "/repo", selectedFile: { ...file } as SelectedGitFile | null,
    selectedRange: null as SourceControlReviewRange | null, agentName: "Codex" as string | null,
    disabled: false, agentHandoffBusy: false, ...overrides,
  });
  const request = vi.fn();
  const clearRange = vi.fn();
  const root = node("root");
  const app = renderer.createApp(defineComponent(() => () => h(Review, {
    ...props, "onAgent-request": request,
    "onClear-range": () => { clearRange(); props.selectedRange = null; },
  })));
  app.provide(ssrContextKey, { modules: new Set() });
  mounted.push(app);
  app.mount(root);
  return { root, props, request, clearRange, app };
}

beforeEach(() => {
  _resetCommitDraftsForTests();
  clipboard.mockReset().mockResolvedValue(undefined);
  toast.mockReset();
  vi.stubGlobal("Document", class {});
  vi.stubGlobal("ShadowRoot", class {});
});
afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  vi.unstubAllGlobals();
});

describe("SourceControlReview rendered behavior", () => {
  it("pins first typed feedback to its initial file when the selected file changes", async () => {
    const { root, props } = mountReview();
    await type(root, "Unfinished original file note");
    props.selectedFile = { path: "src/b.ts", staged: true, untracked: false };
    await nextTick();
    expect(textarea(root).value).toBe("Unfinished original file note");
    expect(getSourceControlReviewDraft("pane:a", "/repo").editor.file).toEqual(file);
    await fire(button(root, "Add comment"), "click");
    expect(getSourceControlReviewDraft("pane:a", "/repo").comments[0]).toMatchObject({ file, body: "Unfinished original file note" });
  });

  it("binds an idle editor to the current file after remount instead of restoring the prior idle file", async () => {
    const first = mountReview();
    await type(first.root, "First file note");
    await fire(button(first.root, "Add comment"), "click");
    first.app.unmount();
    const currentFile = { path: "src/b.ts", staged: true, untracked: false };
    const current = mountReview({ selectedFile: currentFile });
    await type(current.root, "Second file note");
    expect(getSourceControlReviewDraft("pane:a", "/repo").editor.file).toEqual(currentFile);
    await fire(button(current.root, "Add comment"), "click");
    expect(getSourceControlReviewDraft("pane:a", "/repo").comments.map((comment) => comment.file)).toEqual([file, currentFile]);
  });

  it("preserves an empty captured range when remounting with a different current file", async () => {
    const draft = savedDraft();
    draft.editor = { id: null, file: { ...file }, range: { ...range }, body: "" };
    setSourceControlReviewDraft("pane:a", "/repo", draft);
    const { root } = mountReview({ selectedFile: { path: "src/b.ts", staged: true, untracked: false } });
    await type(root, "Captured original lines");
    expect(getSourceControlReviewDraft("pane:a", "/repo").editor).toMatchObject({ file, range, body: "Captured original lines" });
  });

  it("disables Edit and preserves pending editor text when an edit event is attempted", async () => {
    setSourceControlReviewDraft("pane:a", "/repo", savedDraft());
    const { root } = mountReview();
    await type(root, "Pending separate comment");
    const edit = button(root, "Edit");
    expect(edit.props.disabled).toBe(true);
    await fire(edit, "click");
    expect(textarea(root).value).toBe("Pending separate comment");
    expect(getSourceControlReviewDraft("pane:a", "/repo").editor.id).toBeNull();
  });

  it("does not reset unsaved changes when Edit is clicked again on the same comment", async () => {
    setSourceControlReviewDraft("pane:a", "/repo", savedDraft());
    const { root } = mountReview();
    await fire(button(root, "Edit"), "click");
    await type(root, "Changed but unsaved");
    await fire(button(root, "Edit"), "click");
    expect(textarea(root).value).toBe("Changed but unsaved");
    expect(getSourceControlReviewDraft("pane:a", "/repo").editor.body).toBe("Changed but unsaved");
  });

  it("saves the existing edited comment once before switching to the current file", async () => {
    const draft = savedDraft();
    draft.editor = { id: "one", file: { ...file }, range: null, body: "Updated saved note" };
    setSourceControlReviewDraft("pane:a", "/repo", draft);
    const nextFile = { path: "src/b.ts", staged: true, untracked: false };
    const { root, clearRange } = mountReview({ selectedFile: nextFile });
    await fire(button(root, "Switch to current file"), "click");
    const stored = getSourceControlReviewDraft("pane:a", "/repo");
    expect(stored.comments).toEqual([{ ...draft.comments[0], body: "Updated saved note" }]);
    expect(stored.editor).toEqual({ id: null, file: nextFile, range: null, body: "" });
    expect(clearRange).toHaveBeenCalled();
  });

  it("offers switching files beside Clear selection and saves the unfinished original range", async () => {
    const draft = savedDraft();
    draft.comments = [];
    draft.editor = { id: null, file: { ...file }, range: { ...range }, body: "Original range note" };
    setSourceControlReviewDraft("pane:a", "/repo", draft);
    const currentFile = { path: "src/b.ts", staged: true, untracked: false };
    const { root } = mountReview({ selectedFile: currentFile });
    expect(button(root, "Clear selection")).toBeDefined();
    await fire(button(root, "Switch to current file"), "click");
    const stored = getSourceControlReviewDraft("pane:a", "/repo");
    expect(stored.comments).toHaveLength(1);
    expect(stored.comments[0]).toMatchObject({ file, range, body: "Original range note" });
    expect(stored.editor).toEqual({ id: null, file: currentFile, range: null, body: "" });
  });

  it("keeps an unfinished captured range when new lines are selected", async () => {
    const { root, props, clearRange } = mountReview();
    props.selectedRange = { ...range };
    await nextTick();
    await type(root, "Keep the original captured lines");
    props.selectedRange = { ...range };
    await nextTick();
    expect(clearRange).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    props.selectedRange = { ...range, side: "new", start: 20, end: 25, excerpt: "different lines" };
    await nextTick();
    expect(getSourceControlReviewDraft("pane:a", "/repo").editor.range).toEqual(range);
    expect(clearRange).toHaveBeenCalledOnce();
    expect(props.selectedRange).toBeNull();
    expect(toast).toHaveBeenCalledWith("Save or clear the current comment before selecting other lines.", "warning");
    expect(text(root)).not.toContain("pending");
    await fire(button(root, "Add comment"), "click");
    expect(getSourceControlReviewDraft("pane:a", "/repo").comments[0].range).toEqual(range);
  });

  it("rejects another range while editing a saved comment with its body temporarily cleared", async () => {
    const draft = savedDraft();
    draft.comments[0].range = { ...range };
    setSourceControlReviewDraft("pane:a", "/repo", draft);
    const { root, props, clearRange } = mountReview();
    await fire(button(root, "Edit"), "click");
    await type(root, "");
    props.selectedRange = { ...range, start: 20, end: 25, excerpt: "different lines" };
    await nextTick();
    expect(getSourceControlReviewDraft("pane:a", "/repo").editor).toMatchObject({ id: "one", file, range, body: "" });
    expect(clearRange).toHaveBeenCalledOnce();
    expect(props.selectedRange).toBeNull();
    expect(toast).toHaveBeenCalledWith("Save or cancel your current comment before selecting other lines.", "warning");
    await type(root, "Corrected original note");
    await fire(button(root, "Update comment"), "click");
    expect(getSourceControlReviewDraft("pane:a", "/repo").comments).toEqual([{ ...draft.comments[0], body: "Corrected original note" }]);
  });

  it("restores saved comments and unfinished editor after repository and pane switches and remount", async () => {
    setSourceControlReviewDraft("pane:a", "/repo", savedDraft());
    const { root, props, app } = mountReview();
    await type(root, "Original unfinished editor");
    props.repoRoot = "/other";
    await nextTick();
    expect(textarea(root).value).toBe("");
    await type(root, "Other repository editor");
    props.scopeKey = "pane:b";
    await nextTick();
    expect(textarea(root).value).toBe("");
    await type(root, "Other pane editor");
    props.scopeKey = "pane:a";
    await nextTick();
    expect(textarea(root).value).toBe("Other repository editor");
    props.repoRoot = "/repo";
    await nextTick();
    expect(textarea(root).value).toBe("Original unfinished editor");
    expect(text(root)).toContain("Saved note");
    app.unmount();
    const restored = mountReview();
    expect(textarea(restored.root).value).toBe("Original unfinished editor");
    expect(text(restored.root)).toContain("Saved note");
  });

  it("keeps comments after clipboard and agent export and disables export without an agent", async () => {
    const draft = savedDraft();
    setSourceControlReviewDraft("pane:a", "/repo", draft);
    const { root, props, request } = mountReview();
    expect(textarea(root).props["aria-label"]).toBe("Review comment");
    await fire(button(root, "Copy feedback"), "click");
    expect(clipboard).toHaveBeenCalledOnce();
    expect(clipboard.mock.calls[0][0]).toContain("Saved note");
    expect(toast).toHaveBeenCalledWith("Review feedback copied to clipboard", "success");
    const sendButton = button(root, "Send to Codex");
    expect(sendButton.props.title).toContain("Immediately submit review feedback to running Codex in terminal. Finish any existing terminal prompt first.");
    await fire(sendButton, "click");
    expect(request).toHaveBeenCalledExactlyOnceWith({ scopeKey: "pane:a", repoRoot: "/repo", prompt: clipboard.mock.calls[0][0] });
    expect(getSourceControlReviewDraft("pane:a", "/repo").comments).toEqual(draft.comments);
    props.agentName = null;
    await nextTick();
    const disabled = button(root, "Send to agent");
    expect(disabled.props.disabled).toBe(true);
    expect(disabled.props["aria-disabled"]).toBe(true);
    expect(disabled.props.title).toContain("No active CLI agent detected in terminal. Open an agent in terminal or use Copy feedback.");
    expect(text(root)).toContain("No active CLI agent running in terminal; use Copy feedback or open an agent in terminal.");
    await fire(disabled, "click");
    expect(request).toHaveBeenCalledOnce();
    expect(getSourceControlReviewDraft("pane:a", "/repo").comments).toEqual(draft.comments);
  });

  it("disables Send to agent when handoff is busy, preventing emission and retaining comments", async () => {
    const draft = savedDraft();
    setSourceControlReviewDraft("pane:a", "/repo", draft);
    const { root, props, request } = mountReview({ agentHandoffBusy: true });
    const sendButton = button(root, "Send to Codex");
    expect(sendButton.props.disabled).toBe(true);
    expect(sendButton.props["aria-disabled"]).toBe(true);
    await fire(sendButton, "click");
    expect(request).not.toHaveBeenCalled();
    expect(getSourceControlReviewDraft("pane:a", "/repo").comments).toEqual(draft.comments);

    props.agentHandoffBusy = false;
    await nextTick();
    expect(sendButton.props.disabled).toBe(false);
    expect(sendButton.props["aria-disabled"]).toBe(false);
    await fire(sendButton, "click");
    expect(request).toHaveBeenCalledOnce();
    expect(getSourceControlReviewDraft("pane:a", "/repo").comments).toEqual(draft.comments);
  });

  it("retains comments and reports clipboard failures globally", async () => {
    setSourceControlReviewDraft("pane:a", "/repo", savedDraft());
    clipboard.mockRejectedValueOnce(new Error("Clipboard unavailable"));
    const { root } = mountReview();
    await fire(button(root, "Copy feedback"), "click");
    expect(toast).toHaveBeenCalledWith("Clipboard unavailable", "error");
    expect(getSourceControlReviewDraft("pane:a", "/repo").comments).toHaveLength(1);
  });
});
