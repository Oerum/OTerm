<script setup lang="ts">
import { computed, ref } from "vue";
import { CLI_AGENTS, type CliAgentId } from "../lib/terminalAgentMode";
import { buildAgentOpsRows } from "../lib/agentOpsBoard";
import type { WorkspaceTab } from "../types/terminal";
import AgentOpsRow from "./AgentOpsRow.vue";

const props = defineProps<{
  tabs: WorkspaceTab[];
}>();

const emit = defineEmits<{
  close: [];
  launchAgent: [agentId: CliAgentId];
  selectPane: [tabId: string, paneId: string];
}>();

const launchAgentId = ref<CliAgentId>(CLI_AGENTS[0]?.id ?? "claude");

const rows = computed(() => buildAgentOpsRows(props.tabs));
const attentionRows = computed(() => rows.value.filter((r) => r.needsAttention));
const otherRows = computed(() => rows.value.filter((r) => !r.needsAttention));

function jumpTo(tabId: string, paneId: string) {
  emit("selectPane", tabId, paneId);
  // Current mount model is exclusive with terminals — close so jump focuses the PTY.
  emit("close");
}

function launch() {
  emit("launchAgent", launchAgentId.value);
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-[var(--oterm-bg)]">
    <header
      class="flex shrink-0 items-center justify-between border-b border-[var(--oterm-border)] px-4 py-2"
    >
      <div>
        <h1 class="text-sm font-semibold text-[var(--oterm-text)]">Agent Ops</h1>
        <p class="text-[11px] text-[var(--oterm-faint)]">
          Live agent panes — jump, launch, keep going
        </p>
      </div>
      <button
        type="button"
        class="rounded px-2 py-1 text-xs text-[var(--oterm-muted)] hover:bg-white/5 hover:text-[var(--oterm-text)]"
        @click="emit('close')"
      >
        Close
      </button>
    </header>

    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <section class="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-panel)] p-3">
        <label class="text-[11px] text-[var(--oterm-faint)]" for="agent-ops-launch">Launch</label>
        <select
          id="agent-ops-launch"
          v-model="launchAgentId"
          class="rounded border border-[var(--oterm-border)] bg-[var(--oterm-bg)] px-2 py-1 text-xs text-[var(--oterm-text)]"
        >
          <option v-for="agent in CLI_AGENTS" :key="agent.id" :value="agent.id">
            {{ agent.displayName }}
          </option>
        </select>
        <button
          type="button"
          class="rounded bg-[var(--oterm-accent)]/20 px-3 py-1 text-xs font-medium text-[var(--oterm-accent)] hover:bg-[var(--oterm-accent)]/30"
          @click="launch"
        >
          Start
        </button>
      </section>

      <section v-if="attentionRows.length">
        <h2 class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-red-400">
          Needs input
        </h2>
        <ul class="space-y-1">
          <AgentOpsRow
            v-for="row in attentionRows"
            :key="`${row.tabId}:${row.paneId}`"
            :row="row"
            attention
            @jump="jumpTo"
          />
        </ul>
      </section>

      <section>
        <h2 class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--oterm-faint)]">
          Active agents
        </h2>
        <p v-if="rows.length === 0" class="text-xs text-[var(--oterm-faint)]">
          No agents running. Launch one above.
        </p>
        <ul v-else class="space-y-1">
          <AgentOpsRow
            v-for="row in otherRows"
            :key="`${row.tabId}:${row.paneId}`"
            :row="row"
            @jump="jumpTo"
          />
        </ul>
      </section>
    </div>
  </div>
</template>
