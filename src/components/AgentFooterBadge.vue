<script setup lang="ts">
import { computed } from "vue";
import {
  getCliAgentDefinition,
  type CliAgentId,
} from "../lib/terminalAgentMode";

const props = defineProps<{
  agentId: CliAgentId;
}>();

const agent = computed(() => getCliAgentDefinition(props.agentId));

const initial = computed(() => agent.value.displayName.charAt(0).toUpperCase());

const lightTile = computed(() => {
  const color = agent.value.brandColor.toLowerCase();
  return color === "#ffffff" || color === "#fff";
});
</script>

<template>
  <span
    class="no-drag flex shrink-0 items-center"
    :title="agent.displayName"
    :aria-label="agent.displayName"
  >
    <img
      v-if="agent.logoFile"
      :src="agent.logoFile"
      :alt="agent.displayName"
      width="16"
      height="16"
      class="h-4 w-4 shrink-0"
    />

    <span
      v-else
      class="flex h-4 w-4 items-center justify-center rounded-full"
      :class="lightTile ? 'border border-[var(--warp-border-strong)] bg-[var(--warp-surface)]' : ''"
      :style="lightTile ? undefined : { backgroundColor: agent.brandColor }"
    >
      <span
        class="text-[9px] font-semibold leading-none"
        :class="lightTile ? 'text-[var(--warp-text)]' : 'text-white'"
      >
        {{ initial }}
      </span>
    </span>
  </span>
</template>
