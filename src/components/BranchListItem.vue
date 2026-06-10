<script setup lang="ts">
import type { BranchRefInfo } from "../types/branchManager";

defineProps<{
  branch: BranchRefInfo;
  busy?: boolean;
  indented?: boolean;
}>();

const emit = defineEmits<{
  switch: [];
  create: [];
  merge: [];
  delete: [];
  contextmenu: [event: MouseEvent];
}>();
</script>

<template>
  <div
    class="mb-0.5 flex items-stretch gap-0.5 rounded"
    :class="[branch.isCurrent ? 'bg-[var(--oterm-accent-dim)]' : '', indented ? 'ml-3' : '']"
    @contextmenu.prevent="emit('contextmenu', $event)"
  >
    <button
      type="button"
      class="min-w-0 flex-1 rounded px-2 py-1 text-left text-xs hover:bg-white/5"
      :class="branch.isCurrent ? 'text-[var(--oterm-accent)]' : ''"
      :title="branch.name"
      @click="emit('switch')"
    >
      <div class="truncate">{{ branch.name }}</div>
      <div v-if="branch.ahead || branch.behind" class="text-[10px] text-[var(--oterm-muted)]">
        ↑{{ branch.ahead }} ↓{{ branch.behind }}
      </div>
    </button>
    <button
      type="button"
      class="shrink-0 rounded px-1 text-[10px] text-[var(--oterm-muted)] hover:bg-white/5 hover:text-[var(--oterm-text)]"
      title="Create branch from this branch"
      :disabled="busy"
      @click.stop="emit('create')"
    >
      +
    </button>
    <button
      type="button"
      class="shrink-0 rounded px-1 text-[10px] text-[var(--oterm-muted)] hover:bg-white/5 hover:text-[var(--oterm-text)]"
      title="Merge into another branch"
      :disabled="busy"
      @click.stop="emit('merge')"
    >
      ⇄
    </button>
    <button
      type="button"
      class="shrink-0 rounded px-1 text-[10px] text-[var(--oterm-muted)] hover:bg-white/5 hover:text-[var(--oterm-danger)] disabled:cursor-not-allowed disabled:opacity-30"
      :title="branch.isCurrent ? 'Cannot delete current branch' : 'Delete branch'"
      :disabled="busy || branch.isCurrent"
      @click.stop="emit('delete')"
    >
      ×
    </button>
  </div>
</template>
