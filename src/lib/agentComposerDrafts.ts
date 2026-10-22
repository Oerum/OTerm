import { reactive } from "vue";

export interface AgentComposerDraft {
  text: string;
  attachments: string[];
  sending: boolean;
}

const drafts = new Map<string, AgentComposerDraft>();

export function getAgentComposerDraft(paneId: string): AgentComposerDraft {
  let draft = drafts.get(paneId);
  if (!draft) {
    draft = reactive<AgentComposerDraft>({ text: "", attachments: [], sending: false });
    drafts.set(paneId, draft);
  }
  return draft;
}

export function clearAgentComposerDraft(paneId: string): void {
  drafts.delete(paneId);
}
