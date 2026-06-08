<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  open: boolean;
  query: string;
  entries: string[];
}>();

const emit = defineEmits<{
  "update:query": [value: string];
  close: [];
  select: [entry: string];
}>();

const localQuery = computed({
  get: () => props.query,
  set: (value: string) => emit("update:query", value),
});
</script>

<template>
  <div
    v-if="open"
    class="absolute inset-0 z-30 flex items-start justify-center bg-black/55 pt-[12vh] backdrop-blur-[2px]"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--warp-border-strong)] bg-[var(--warp-elevated)] shadow-2xl"
    >
      <div class="border-b border-[var(--warp-border)] px-4 py-3">
        <input
          v-model="localQuery"
          class="w-full bg-transparent text-sm text-[var(--warp-text)] outline-none placeholder:text-[var(--warp-faint)]"
          placeholder="Search command history..."
          autofocus
        />
      </div>
      <div class="max-h-64 overflow-y-auto py-1">
        <button
          v-for="entry in entries"
          :key="entry"
          type="button"
          class="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-[var(--warp-muted)] transition hover:bg-[var(--warp-accent-dim)] hover:text-[var(--warp-text)]"
          @click="emit('select', entry)"
        >
          <span class="font-mono text-[var(--warp-accent)]">$</span>
          <span class="truncate font-mono">{{ entry }}</span>
        </button>
        <p v-if="entries.length === 0" class="px-4 py-8 text-center text-sm text-[var(--warp-faint)]">
          No matching commands.
        </p>
      </div>
      <div
        class="flex items-center justify-between border-t border-[var(--warp-border)] px-4 py-2 text-[10px] text-[var(--warp-faint)]"
      >
        <span>Enter to run</span>
        <button type="button" class="hover:text-[var(--warp-muted)]" @click="emit('close')">
          Esc to close
        </button>
      </div>
    </div>
  </div>
</template>
