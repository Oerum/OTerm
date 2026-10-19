export async function acceptTerminalSpawn(
  spawn: Promise<string>,
  isCurrent: () => boolean,
  cleanup: (sessionId: string) => Promise<void>,
): Promise<string> {
  const sessionId = await spawn;
  if (isCurrent()) return sessionId;
  await cleanup(sessionId);
  throw new Error("Terminal launch cancelled");
}

/** The invoke response and event stream can arrive in either order. */
export function createTerminalSessionLifecycle(
  isCurrent: (sessionId: string, generation: number) => boolean,
  parseBarrier: (done: () => void) => void,
) {
  let current: { sessionId: string; generation: number } | null = null;
  let attached = false;
  let ending = false;
  let pendingEnd = false;
  let outputSeen = false;

  function matches(sessionId: string, generation: number) {
    return current?.sessionId === sessionId && current.generation === generation &&
      isCurrent(sessionId, generation);
  }

  function begin(sessionId: string, generation: number) {
    current = { sessionId, generation };
    attached = ending = pendingEnd = outputSeen = false;
  }

  async function attach(
    sessionId: string,
    generation: number,
    operation: (sessionId: string) => Promise<{ ended: boolean }>,
  ) {
    const result = await operation(sessionId);
    if (!matches(sessionId, generation)) return false;
    ending ||= result.ended;
    attached = !ending;
    return attached;
  }

  function canSend(sessionId: string, generation: number) {
    return matches(sessionId, generation) && attached && !ending;
  }

  function noteOutput(sessionId: string, generation: number) {
    if (matches(sessionId, generation)) outputSeen = true;
  }

  function end(sessionId: string, generation: number, finalize: () => void) {
    if (!matches(sessionId, generation) || pendingEnd) return;
    ending = pendingEnd = true;
    parseBarrier(() => {
      if (matches(sessionId, generation) && pendingEnd) {
        pendingEnd = false;
        finalize();
      }
    });
  }

  return {
    begin, attach, canSend, noteOutput, end,
    isEnding: () => ending,
    canSendStartup: (sessionId: string, generation: number) =>
      outputSeen && canSend(sessionId, generation),
  };
}
