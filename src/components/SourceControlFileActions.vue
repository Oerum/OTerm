<script setup lang="ts">
defineProps<{
  path: string;
  secondary: "revert" | "delete";
}>();

const emit = defineEmits<{
  stage: [paths: string[]];
  secondary: [path: string];
}>();
</script>

<template>
  <div class="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
    <button
      type="button"
      class="flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs text-[#3dd68c] hover:bg-white/5"
      title="Stage"
      aria-label="Stage"
      @click.stop="emit('stage', [path])"
    >
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 3v10M3 8h10" stroke-linecap="round" />
      </svg>
    </button>
    <button
      type="button"
      class="flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs text-[#ff7b72] hover:bg-white/5"
      :title="secondary === 'delete' ? 'Delete' : 'Revert'"
      :aria-label="secondary === 'delete' ? 'Delete' : 'Revert'"
      @click.stop="emit('secondary', path)"
    >
      <svg
        v-if="secondary === 'delete'"
        width="10"
        height="10"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M3 3l10 10M13 3L3 13" stroke-linecap="round" />
      </svg>
      <svg
        v-else
        width="10"
        height="10"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M3 8a5 5 0 0 1 8.5-3.5L13 6M13 3v3h-3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  </div>
</template>
