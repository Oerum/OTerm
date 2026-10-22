import { submitAgentComposerText, type WriteTerminal } from "./agentComposerSubmit";
import { sameSourceControlAgentTarget, type SourceControlAgentTarget } from "./sourceControlAgent";
import { parseDetectedCliAgentId } from "./terminalAgentReconcile";

export async function sendTerminalAgentPrompt(
  text: string,
  expected: SourceControlAgentTarget,
  context: {
    lock: { sending: boolean };
    current: () => SourceControlAgentTarget | null;
    pendingInput: () => string;
    composerBusy: () => boolean;
    detect: (sessionId: string) => Promise<string | null | undefined>;
    write: WriteTerminal;
  },
): Promise<void> {
  const { lock } = context;
  let ownsLock = false;
  let writeAttempted = false;
  const assertCurrent = () => {
    if (!sameSourceControlAgentTarget(expected, context.current())) {
      throw new Error("The active agent or terminal changed.");
    }
  };
  const assertNoPendingInput = () => {
    if (context.pendingInput().length) throw new Error("Finish the current terminal input before sending.");
  };
  try {
    if (!text.trim()) throw new Error("There is no prompt to send.");
    assertCurrent();
    if (lock.sending || context.composerBusy()) throw new Error("Finish sending or dictating before sending to the agent.");
    assertNoPendingInput();
    lock.sending = ownsLock = true;
    await submitAgentComposerText(expected.sessionId, expected.agentId, text, async (sessionId, data) => {
      assertCurrent();
      if (sessionId !== expected.sessionId || parseDetectedCliAgentId(await context.detect(sessionId)) !== expected.agentId) {
        throw new Error("The running CLI agent could not be confirmed.");
      }
      assertCurrent();
      assertNoPendingInput();
      writeAttempted = true;
      await context.write(sessionId, data);
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(writeAttempted
      ? `Input may already be present or sent. Inspect that terminal before retrying. ${detail}`
      : `Could not send to the agent. ${detail}`);
  } finally {
    if (ownsLock) lock.sending = false;
  }
}
