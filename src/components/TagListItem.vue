<script setup lang="ts">
import type { TagRefInfo } from "../types/branchManager";

defineProps<{
  tag: TagRefInfo;
  selected?: boolean;
}>();

const emit = defineEmits<{
  select: [];
  contextmenu: [event: MouseEvent];
}>();
</script>

<template>
  <div
    class="mb-0.5 flex items-stretch rounded"
    :class="selected ? 'bg-[var(--oterm-accent-dim)]' : ''"
    @contextmenu.prevent="emit('contextmenu', $event)"
  >
    <button
      type="button"
      class="min-w-0 flex-1 rounded px-2 py-1 hover:bg-white/5 flex items-center justify-between gap-1.5 text-left"
      :class="selected ? 'text-[var(--oterm-accent)]' : ''"
      :title="tag.name"
      @click="emit('select')"
    >
      <span class="truncate text-xs">{{ tag.name }}</span>
      <span class="shrink-0 flex items-center gap-1 font-mono text-[9px] text-[var(--oterm-muted)]">
        <span
          v-if="!tag.onOrigin"
          class="rounded bg-white/5 px-1 py-0.5 text-[var(--oterm-faint)]"
        >
          local only
        </span>
        <span>{{ tag.shortHash }}</span>
      </span>
    </button>
  </div>
</template>
