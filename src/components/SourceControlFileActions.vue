<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  paths: string[];
  targetLabel?: string;
  staged?: boolean;
  secondary?: "revert" | "delete";
  disabled?: boolean;
}>();

const emit = defineEmits<{
  stage: [paths: string[]];
  unstage: [paths: string[]];
  secondary: [paths: string[]];
}>();

const contextTarget = computed(
  () => props.targetLabel ?? (props.paths.length === 1 ? props.paths[0] : `${props.paths.length} files`),
);
</script>

<template>
  <div class="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100">
    <button
      v-if="staged"
      type="button"
      class="flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs text-[var(--oterm-faint)] hover:bg-white/5 hover:text-[var(--oterm-text)] disabled:cursor-not-allowed disabled:opacity-40"
      title="Unstage"
      :aria-label="`Unstage ${contextTarget}`"
      :disabled="disabled"
      @click.stop="emit('unstage', paths)"
    >
      <svg aria-hidden="true" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 8h10" stroke-linecap="round" />
      </svg>
    </button>
    <template v-else>
      <button
        type="button"
        class="flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs text-[#3dd68c] hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
        title="Stage"
        :aria-label="`Stage ${contextTarget}`"
        :disabled="disabled"
        @click.stop="emit('stage', paths)"
      >
        <svg aria-hidden="true" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M8 3v10M3 8h10" stroke-linecap="round" />
        </svg>
      </button>
      <button
        v-if="secondary"
        type="button"
        class="flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs text-[#ff7b72] hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
        :title="secondary === 'delete' ? 'Delete' : 'Revert'"
        :aria-label="`${secondary === 'delete' ? 'Delete' : 'Revert'} ${contextTarget}`"
        :disabled="disabled"
        @click.stop="emit('secondary', paths)"
      >
        <svg
          v-if="secondary === 'delete'"
          aria-hidden="true"
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
          aria-hidden="true"
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
    </template>
  </div>
</template>
