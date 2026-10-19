import { describe, expect, it, vi } from "vitest";
import { acceptTerminalSpawn, createTerminalSessionLifecycle } from "./terminalSessionLifecycle";

function setup() {
  let generation = 1;
  let session = "one";
  let disposed = false;
  const parsed: (() => void)[] = [];
  const lifecycle = createTerminalSessionLifecycle(
    (id, gen) => !disposed && session === id && generation === gen,
    (done) => parsed.push(done),
  );
  lifecycle.begin(session, generation);
  return { lifecycle, parsed, dispose: () => { disposed = true; }, replace: () => {
    session = "two"; generation++;
    lifecycle.begin(session, generation);
  } };
}

describe("terminal attachment and parse completion", () => {
  it("kills a session whose spawn resolves after disposal, replacement or timeout", async () => {
    let active = true;
    let resolve!: (id: string) => void;
    const cleanup = vi.fn(async (_id: string) => {});
    const result = acceptTerminalSpawn(new Promise((r) => { resolve = r; }), () => active, cleanup);
    const rejected = expect(result).rejects.toThrow("cancelled");
    active = false; resolve("late"); await rejected;
    expect(cleanup).toHaveBeenCalledExactlyOnceWith("late");
    cleanup.mockClear();
    expect(await acceptTerminalSpawn(Promise.resolve("live"), () => true, cleanup)).toBe("live");
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("handles ended invoke responses arriving before their output and exit events", async () => {
    const { lifecycle, parsed } = setup();
    const created = vi.fn(); const input = vi.fn(); const closed = vi.fn();
    const active = await lifecycle.attach("one", 1, async () => ({ ended: true }));
    if (active) { created(); input(); }
    expect(created).not.toHaveBeenCalled(); expect(input).not.toHaveBeenCalled();
    lifecycle.noteOutput("one", 1);
    expect(lifecycle.canSendStartup("one", 1)).toBe(false);
    lifecycle.end("one", 1, closed);
    expect(closed).not.toHaveBeenCalled();
    // xterm runs the empty-write callback only after the preceding output parses.
    parsed.shift()!(); expect(closed).toHaveBeenCalledOnce();
  });

  it.each([true, false])("SSH startup waits for attachment and first output (output first: %s)", async (outputFirst) => {
    const { lifecycle } = setup();
    let resolve!: (value: { ended: boolean }) => void;
    const attach = lifecycle.attach("one", 1, () => new Promise((r) => { resolve = r; }));
    if (outputFirst) lifecycle.noteOutput("one", 1);
    expect(lifecycle.canSendStartup("one", 1)).toBe(false);
    resolve({ ended: false }); expect(await attach).toBe(true);
    expect(lifecycle.canSendStartup("one", 1)).toBe(outputFirst);
    if (!outputFirst) lifecycle.noteOutput("one", 1);
    expect(lifecycle.canSendStartup("one", 1)).toBe(true);
  });

  it("exit before the invoke response prevents sessionCreated and input", async () => {
    const { lifecycle } = setup();
    let resolve!: (value: { ended: boolean }) => void;
    const attach = lifecycle.attach("one", 1, () => new Promise((r) => { resolve = r; }));
    lifecycle.end("one", 1, vi.fn()); resolve({ ended: false });
    expect(await attach).toBe(false); expect(lifecycle.canSend("one", 1)).toBe(false);
  });

  it.each(["dispose", "replace"] as const)("stale attach and parse callbacks cannot publish after %s", async (action) => {
    const state = setup(); const finalized = vi.fn();
    let resolve!: (value: { ended: boolean }) => void;
    const attach = state.lifecycle.attach("one", 1, () => new Promise((r) => { resolve = r; }));
    state.lifecycle.end("one", 1, finalized); state[action]();
    resolve({ ended: false }); expect(await attach).toBe(false);
    state.parsed.shift()!(); expect(finalized).not.toHaveBeenCalled();
  });
});
