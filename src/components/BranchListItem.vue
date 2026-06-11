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
      class="min-w-0 flex-1 rounded px-2 py-1 hover:bg-white/5 flex items-center justify-between gap-1.5"
      :class="branch.isCurrent ? 'text-[var(--oterm-accent)] font-semibold' : ''"
      :title="branch.name"
      @click="emit('switch')"
    >
      <span class="flex items-center gap-1.5 min-w-0">
        <span v-if="branch.isCurrent" class="h-1.5 w-1.5 rounded-full bg-[var(--oterm-accent)] shrink-0" />
        <span class="truncate text-xs">{{ branch.name }}</span>
      </span>
      <span
        v-if="branch.ahead || branch.behind"
        class="shrink-0 flex items-center gap-1 font-mono text-[9px] font-semibold text-[var(--oterm-muted)] bg-white/5 px-1 py-0.5 rounded"
      >
        <span v-if="branch.ahead" class="text-green-400">↑{{ branch.ahead }}</span>
        <span v-if="branch.behind" class="text-red-400">↓{{ branch.behind }}</span>
      </span>
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
