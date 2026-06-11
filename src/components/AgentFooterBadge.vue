<script setup lang="ts">
import { computed } from "vue";
import {
  getCliAgentDefinition,
  type CliAgentId,
} from "../lib/terminalAgentMode";

const props = withDefaults(
  defineProps<{
    agentId: CliAgentId;
    size?: "sm" | "md";
  }>(),
  {
    size: "sm",
  }
);

const agent = computed(() => getCliAgentDefinition(props.agentId));

const initial = computed(() => agent.value.displayName.charAt(0).toUpperCase());

const lightTile = computed(() => {
  const color = agent.value.brandColor.toLowerCase();
  return color === "#ffffff" || color === "#fff";
});

const cursorTile = computed(() => agent.value.id === "cursor");
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
      :class="[
        size === 'md' ? 'h-[18px] w-[18px]' : 'h-3.5 w-3.5',
        cursorTile ? 'rounded-[4px] bg-white' : '',
      ]"
      class="shrink-0"
    />

    <span
      v-else
      class="flex items-center justify-center rounded-full"
      :class="[
        size === 'md' ? 'h-[18px] w-[18px]' : 'h-3.5 w-3.5',
        lightTile ? 'border border-[var(--oterm-border-strong)] bg-[var(--oterm-surface)]' : ''
      ]"
      :style="lightTile ? undefined : { backgroundColor: agent.brandColor }"
    >
      <span
        class="font-semibold leading-none"
        :class="[
          size === 'md' ? 'text-[10px]' : 'text-[8px]',
          lightTile ? 'text-[var(--oterm-text)]' : 'text-white'
        ]"
      >
        {{ initial }}
      </span>
    </span>
  </span>
</template>
