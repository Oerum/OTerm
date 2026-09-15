<script setup lang="ts">
import {
  agentStatusDotClass,
  agentStatusLabel,
  agentStatusTextClass,
} from "../lib/agentStatus";
import type { AgentOpsRow } from "../lib/agentOpsBoard";
import AgentFooterBadge from "./AgentFooterBadge.vue";

defineProps<{
  row: AgentOpsRow;
  attention?: boolean;
}>();

const emit = defineEmits<{
  jump: [tabId: string, paneId: string];
}>();
</script>

<template>
  <li
    class="flex items-center gap-3 rounded-lg border px-3 py-2"
    :class="
      attention
        ? 'border-red-400/20 bg-red-500/5'
        : 'border-[var(--oterm-border)] bg-[var(--oterm-panel)]'
    "
  >
    <AgentFooterBadge :agent-id="row.agentId" size="sm" />
    <div class="min-w-0 flex-1">
      <div class="truncate text-xs font-medium text-[var(--oterm-text)]">{{ row.title }}</div>
      <div class="truncate font-mono text-[10px] text-[var(--oterm-faint)]">{{ row.cwd }}</div>
    </div>
    <span
      class="flex items-center gap-1 text-[10px] font-semibold"
      :class="agentStatusTextClass(row.status)"
    >
      <span class="h-1.5 w-1.5 rounded-full" :class="agentStatusDotClass(row.status)" />
      {{ agentStatusLabel(row.status) }}
    </span>
    <button
      type="button"
      class="rounded px-2 py-1 text-[11px] text-[var(--oterm-accent)] hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oterm-accent)]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--oterm-panel)]"
      :aria-label="`Jump to ${row.title}`"
      @click="emit('jump', row.tabId, row.paneId)"
    >
      Jump
    </button>
  </li>
</template>
