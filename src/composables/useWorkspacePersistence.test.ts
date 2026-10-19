import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick } from "vue";
import { useWorkspace } from "./useWorkspace";
import { useWorkspacePersistence } from "./useWorkspacePersistence";
import { EMPTY_TERMINAL_WORKSPACE } from "../lib/workspaceStore";

const hooks = vi.hoisted(() => ({ unmount: [] as (() => void)[] }));
const native = vi.hoisted(() => ({
  close: undefined as undefined | ((event: { preventDefault: () => void }) => Promise<void>),
  destroy: vi.fn(async () => {}),
  save: vi.fn(async (_value: unknown) => {}),
  unlisten: vi.fn(),
}));
vi.mock("vue", async (original) => ({
  ...await original<typeof import("vue")>(),
  onMounted: (callback: () => void) => callback(),
  onUnmounted: (callback: () => void) => hooks.unmount.push(callback),
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({
  onCloseRequested: async (callback: typeof native.close) => { native.close = callback; return native.unlisten; },
  destroy: native.destroy,
  close: native.destroy,
}) }));
vi.mock("../lib/workspaceStore", async (original) => ({
  ...await original<typeof import("../lib/workspaceStore")>(),
  savePersistedTerminalWorkspace: native.save,
}));

let scopes: ReturnType<typeof effectScope>[] = [];
function setup(beforeDestroy?: () => Promise<void>) {
  const scope = effectScope(); scopes.push(scope);
  return scope.run(() => {
    const workspace = useWorkspace(() => "bash");
    workspace.createTab("bash", "/repo");
    const persistence = useWorkspacePersistence(workspace.serializeTerminalWorkspace, { beforeDestroy });
    return { workspace, persistence };
  })!;
}

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  const windowTarget = new EventTarget();
  Object.assign(windowTarget, { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
  vi.stubGlobal("window", windowTarget);
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
});
afterEach(() => {
  hooks.unmount.splice(0).forEach((callback) => callback());
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("workspace persistence uses the real durable snapshot", () => {
  it("does not save for session, process, agent or notification noise", async () => {
    const { workspace } = setup();
    await nextTick();
    const pane = workspace.activePane.value!;
    pane.sessionId = "runtime"; pane.bootstrappingSessionId = "starting";
    pane.activeProcessName = "node"; pane.activeProcessCmd = "node cli.js";
    pane.activeAgentId = "codex"; pane.agentStatus = "working";
    pane.agentStatusSeen = false; pane.hasUnseenNotification = true; pane.oscTitle = "running";
    await nextTick(); await vi.advanceTimersByTimeAsync(1000);
    expect(native.save).not.toHaveBeenCalled();
  });

  it("debounces durable pane/group/tab/focus changes and persists an empty workspace", async () => {
    const { workspace } = setup(); await nextTick();
    workspace.activePane.value!.cwd = "/changed";
    workspace.activePane.value!.customTitle = "Build";
    workspace.activeTerminalTab.value!.title = "Work";
    workspace.createGroup("Group");
    workspace.collapsedGroupIds.value = [workspace.terminalGroups.value[0]!.id];
    workspace.createTab("zsh", "/other");
    await nextTick(); await vi.advanceTimersByTimeAsync(249);
    expect(native.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(native.save).toHaveBeenCalledExactlyOnceWith(workspace.serializeTerminalWorkspace());
    workspace.tabs.value = []; await nextTick(); await vi.advanceTimersByTimeAsync(250);
    expect(native.save).toHaveBeenLastCalledWith(EMPTY_TERMINAL_WORKSPACE);
  });

  it("flushes pending data before close cleanup and window destruction", async () => {
    const cleanup = vi.fn(async () => {});
    const { workspace } = setup(cleanup); await nextTick();
    workspace.activePane.value!.cwd = "/closing"; await nextTick();
    const preventDefault = vi.fn(); await native.close!({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(native.save).toHaveBeenCalledExactlyOnceWith(workspace.serializeTerminalWorkspace());
    expect(cleanup).toHaveBeenCalledOnce(); expect(native.destroy).toHaveBeenCalledOnce();
    expect(native.save.mock.invocationCallOrder[0]).toBeLessThan(cleanup.mock.invocationCallOrder[0]!);
    expect(cleanup.mock.invocationCallOrder[0]).toBeLessThan(native.destroy.mock.invocationCallOrder[0]!);
  });

  it("flushes page-hide and cancels a queued save on teardown", async () => {
    const { workspace } = setup(); await nextTick();
    window.dispatchEvent(new Event("pagehide")); await nextTick();
    expect(native.save).toHaveBeenCalledOnce();
    workspace.activePane.value!.cwd = "/unsaved"; await nextTick();
    hooks.unmount.splice(0).forEach((callback) => callback());
    await vi.advanceTimersByTimeAsync(1000); expect(native.save).toHaveBeenCalledOnce();
    expect(native.unlisten).toHaveBeenCalledOnce();
  });

  it("still destroys the window if save and cleanup do not settle", async () => {
    native.save.mockImplementationOnce(() => new Promise(() => {}));
    setup(() => new Promise(() => {})); await nextTick();
    const closing = native.close!({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(5000); await closing;
    expect(native.destroy).toHaveBeenCalledOnce();
  });
});
