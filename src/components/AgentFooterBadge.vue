<script setup lang="ts">
import { computed } from "vue";
import {
  getCliAgentDefinition,
  type CliAgentId,
} from "../lib/terminalAgentMode";
import {
  agentStatusDotClass,
  displayAgentStatus,
  type AgentDisplayStatus,
} from "../lib/agentStatus";
import type { AgentSemanticStatus } from "../types/terminal";

const props = withDefaults(
  defineProps<{
    agentId: CliAgentId;
    size?: "sm" | "md";
    status?: AgentSemanticStatus | null;
    statusSeen?: boolean;
  }>(),
  {
    size: "sm",
    status: null,
    statusSeen: true,
  },
);

const agent = computed(() => getCliAgentDefinition(props.agentId));

const initial = computed(() => agent.value.displayName.charAt(0).toUpperCase());

const lightTile = computed(() => {
  const color = agent.value.brandColor.toLowerCase();
  return color === "#ffffff" || color === "#fff";
});

const whiteBgTile = computed(() => {
  const ids = ["cursor", "codex", "goose", "auggie", "droid", "opencode"];
  return ids.includes(agent.value.id);
});

const displayStatus = computed<AgentDisplayStatus | null>(() => {
  if (!props.status || props.status === "unknown") return null;
  return displayAgentStatus(props.status, props.statusSeen);
});

const dotClass = computed(() =>
  displayStatus.value ? agentStatusDotClass(displayStatus.value) : "",
);
</script>

<template>
  <span
    class="no-drag relative flex shrink-0 items-center"
    :title="agent.displayName"
    :aria-label="agent.displayName"
  >
    <img
      v-if="agent.logoFile"
      :src="agent.logoFile"
      :alt="agent.displayName"
      :class="[
        size === 'md' ? 'h-[18px] w-[18px]' : 'h-3.5 w-3.5',
        whiteBgTile ? 'rounded-[4px] bg-white' : '',
      ]"
      class="shrink-0"
    />

    <span
      v-else
      class="flex items-center justify-center rounded-full"
      :class="[
        size === 'md' ? 'h-[18px] w-[18px]' : 'h-3.5 w-3.5',
        lightTile ? 'border border-[var(--oterm-border-strong)] bg-[var(--oterm-surface)]' : '',
      ]"
      :style="lightTile ? undefined : { backgroundColor: agent.brandColor }"
    >
      <span
        class="font-semibold leading-none"
        :class="[
          size === 'md' ? 'text-[10px]' : 'text-[8px]',
          lightTile ? 'text-[var(--oterm-text)]' : 'text-white',
        ]"
      >
        {{ initial }}
      </span>
    </span>

    <span
      v-if="displayStatus"
      class="absolute rounded-full ring-1 ring-[var(--oterm-bg)]"
      :class="[
        dotClass,
        size === 'md' ? '-bottom-0.5 -right-0.5 h-2 w-2' : '-bottom-0.5 -right-0.5 h-1.5 w-1.5',
      ]"
      aria-hidden="true"
    />
  </span>
</template>
