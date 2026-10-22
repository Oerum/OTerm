import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref, ssrContextKey } from "vue";
import AgentComposer from "./AgentComposer.vue";
import composerSource from "./AgentComposer.vue?raw";
import {
  clientTestComponent, fireTestEvent as fire, testButton as button, testNode,
  testNodes, testRenderer, testTextarea as textarea, typeTestText as type,
} from "../lib/componentTestRenderer";
import { clearAgentComposerDraft, getAgentComposerDraft } from "../lib/agentComposerDrafts";
import { sendTerminalAgentPrompt } from "../lib/terminalAgentSend";
import type { SourceControlAgentTarget } from "../lib/sourceControlAgent";

const { write, transcribe, status, startRecording, cancelRecording, listenPartial, toast } = vi.hoisted(() => ({
  write: vi.fn(), transcribe: vi.fn(), status: vi.fn(), startRecording: vi.fn(), cancelRecording: vi.fn(), listenPartial: vi.fn(), toast: vi.fn(),
}));
vi.mock("../lib/terminalApi", () => ({ writeTerminal: write }));
vi.mock("../lib/appToast", () => ({ pushAppToast: toast }));
vi.mock("./AgentFooterBadge.vue", () => ({ default: { render: () => null } }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ scaleFactor: async () => 1 }) }));
vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }) }));
vi.mock("../lib/dictationApi", () => ({
  getDictationStatus: status, startDictationRecording: startRecording,
  cancelDictationRecording: cancelRecording, stopDictationAndTranscribe: transcribe,
  downloadDictationModel: async () => {}, listenDictationModelDownloadProgress: async () => () => {},
  listenDictationLivePartial: listenPartial,
}));

const Composer = clientTestComponent(AgentComposer, composerSource);
const target: SourceControlAgentTarget = {
  paneId: "composer-pane", sessionId: "session", agentId: "codex", cwd: "/repo", repoRoot: "/repo", scopeKey: "pane:composer-pane",
};
const mounted: { unmount: () => void }[] = [];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function mountComposer() {
  const visible = ref(true);
  const root = testNode("root");
  const app = testRenderer.createApp(defineComponent(() => () => visible.value ? h(Composer, {
    paneId: target.paneId, sessionId: target.sessionId, agentId: target.agentId, cwd: target.cwd,
    onClose: () => { visible.value = false; },
  }) : null));
  app.provide(ssrContextKey, { modules: new Set() });
  mounted.push(app);
  app.mount(root);
  return { root, visible };
}
async function reopen(view: ReturnType<typeof mountComposer>) {
  await fire(button(view.root, "Close"), "click");
  view.visible.value = true;
  await nextTick();
}
function dictateButton(root: ReturnType<typeof testNode>) {
  const found = testNodes(root).find((item) => item.props["aria-label"] === "Dictate");
  if (!found) throw new Error("Dictate button not found");
  return found;
}

beforeEach(() => {
  clearAgentComposerDraft(target.paneId);
  write.mockReset().mockResolvedValue(undefined);
  transcribe.mockReset();
  status.mockReset().mockResolvedValue({ modelInstalled: true });
  startRecording.mockReset().mockResolvedValue(undefined);
  cancelRecording.mockReset().mockResolvedValue(undefined);
  listenPartial.mockReset().mockResolvedValue(() => {});
  toast.mockReset();
  vi.stubGlobal("Document", class {});
  vi.stubGlobal("ShadowRoot", class {});
  vi.stubGlobal("window", { clearTimeout, setTimeout });
});
afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  clearAgentComposerDraft(target.paneId);
  vi.unstubAllGlobals();
});

describe("AgentComposer shared draft lifetime", () => {
  it("blocks mounted composer send and dictation while native process detection holds the shared lock", async () => {
    const detected = deferred<string | null>();
    const draft = getAgentComposerDraft(target.paneId);
    draft.text = "My separate composer draft";
    draft.attachments = ["/image.png"];
    const view = mountComposer();
    const detect = vi.fn().mockResolvedValue(target.agentId).mockImplementationOnce(() => detected.promise);
    const nativeSend = sendTerminalAgentPrompt("Review\nfeedback", target, {
      lock: draft, current: () => target, pendingInput: () => "", composerBusy: () => false, detect, write,
    });
    try {
      await nextTick();
      expect(button(view.root, "Send").props.disabled).toBe(true);
      expect(dictateButton(view.root).props.disabled).toBe(true);
      await fire(button(view.root, "Send"), "click");
      await fire(dictateButton(view.root), "click");
      expect(write).not.toHaveBeenCalled();
      expect(startRecording).not.toHaveBeenCalled();
      expect(draft.text).toBe("My separate composer draft");
      expect(draft.attachments).toEqual(["/image.png"]);
    } finally {
      detected.resolve(target.agentId);
      await nativeSend;
    }
    expect(button(view.root, "Send").props.disabled).toBe(false);
    expect(dictateButton(view.root).props.disabled).toBe(false);
    expect(draft).toEqual({ text: "My separate composer draft", attachments: ["/image.png"], sending: false });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("keeps sending locked across close/reopen and prevents duplicate sends or draft mutations", async () => {
    const firstWrite = deferred<void>();
    write.mockImplementationOnce(() => firstWrite.promise);
    const draft = getAgentComposerDraft(target.paneId);
    draft.text = "Unsent user message";
    draft.attachments = ["/image.png"];
    const view = mountComposer();
    const sending = fire(button(view.root, "Send"), "click");
    try {
      await nextTick();
      await reopen(view);
      expect(button(view.root, "Send").props.disabled).toBe(true);
      expect(textarea(view.root).props.disabled).toBe(true);
      const snapshot = JSON.stringify(draft);
      await type(view.root, "Replacement message");
      await expect(sendTerminalAgentPrompt("Review feedback", target, {
        lock: draft, current: () => target, pendingInput: () => "", composerBusy: () => false,
        detect: async () => target.agentId, write,
      })).rejects.toThrow("Finish sending or dictating");
      expect(JSON.stringify(draft)).toBe(snapshot);
      await fire(button(view.root, "Send"), "click");
      expect(write).toHaveBeenCalledOnce();
    } finally {
      firstWrite.resolve();
      await sending;
    }
  });

  it("releases a failed pending send after recreation while preserving ordinary text and attachments", async () => {
    const firstWrite = deferred<void>();
    write.mockImplementationOnce(() => firstWrite.promise);
    const draft = getAgentComposerDraft(target.paneId);
    draft.text = "Keep my message";
    draft.attachments = ["/image.png"];
    const view = mountComposer();
    const sending = fire(button(view.root, "Send"), "click");
    await reopen(view);
    firstWrite.reject(new Error("Write failed"));
    await sending;
    expect(draft).toEqual({ text: "Keep my message", attachments: ["/image.png"], sending: false });
    expect(button(view.root, "Send").props.disabled).toBe(false);
    expect(toast).toHaveBeenCalledWith("Write failed", "error");
    await type(view.root, "Updated message");
    expect(textarea(view.root).value).toBe("Updated message");
  });

  it("ignores an old transcription completing after the composer closes and its draft is edited", async () => {
    const result = deferred<{ text: string }>();
    transcribe.mockImplementationOnce(() => result.promise);
    const draft = getAgentComposerDraft(target.paneId);
    draft.text = "Original draft";
    const view = mountComposer();
    await fire(dictateButton(view.root), "click");
    const stopping = fire(button(view.root, "Stop"), "click");
    await reopen(view);
    await type(view.root, "Original draft\n\nNew message");
    result.resolve({ text: "Obsolete transcription" });
    await stopping;
    expect(textarea(view.root).value).toBe("Original draft\n\nNew message");
  });

  it("does not start recording after closing during model readiness", async () => {
    const ready = deferred<{ modelInstalled: boolean }>();
    status.mockImplementationOnce(() => ready.promise);
    const view = mountComposer();
    const starting = fire(dictateButton(view.root), "click");
    await reopen(view);
    await type(view.root, "New message");
    ready.resolve({ modelInstalled: true });
    await starting;
    expect(startRecording).not.toHaveBeenCalled();
    expect(textarea(view.root).value).toBe("New message");
  });

  it("cancels a recorder that finishes starting after its composer has closed", async () => {
    const started = deferred<void>();
    const requested = deferred<void>();
    startRecording.mockImplementationOnce(() => { requested.resolve(); return started.promise; });
    const view = mountComposer();
    const starting = fire(dictateButton(view.root), "click");
    await requested.promise;
    await reopen(view);
    await type(view.root, "New message");
    started.resolve();
    await starting;
    expect(cancelRecording).toHaveBeenCalledOnce();
    expect(textarea(view.root).value).toBe("New message");
  });

  it("unsubscribes and cancels recording when its live listener arrives after close", async () => {
    const listening = deferred<() => void>();
    const requested = deferred<void>();
    const unsubscribe = vi.fn();
    listenPartial.mockImplementationOnce(() => { requested.resolve(); return listening.promise; });
    const view = mountComposer();
    const starting = fire(dictateButton(view.root), "click");
    await requested.promise;
    await reopen(view);
    await type(view.root, "New message");
    listening.resolve(unsubscribe);
    await starting;
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(cancelRecording).toHaveBeenCalledOnce();
    expect(textarea(view.root).value).toBe("New message");
  });

  it("preserves ordinary composer text and attachments when native submission closes and reopens it", async () => {
    const draft = getAgentComposerDraft(target.paneId);
    draft.text = "My separate composer draft";
    draft.attachments = ["/image.png"];
    const view = mountComposer();
    await sendTerminalAgentPrompt("Review\nfeedback", target, {
      lock: draft, current: () => target, pendingInput: () => "", composerBusy: () => false,
      detect: async () => target.agentId, write,
    });
    await reopen(view);
    expect(textarea(view.root).value).toBe("My separate composer draft");
    expect(draft).toEqual({ text: "My separate composer draft", attachments: ["/image.png"], sending: false });
    expect(write).toHaveBeenCalledTimes(2);
  });
});
