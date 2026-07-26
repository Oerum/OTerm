<script setup lang="ts">
defineProps<{
  busy?: boolean;
  disabled?: boolean;
  showStage?: boolean;
  showUnstage?: boolean;
}>();

const emit = defineEmits<{
  revert: [];
  stage: [];
  unstage: [];
}>();
</script>

<template>
  <div
    class="diff-gutter-actions"
    :class="{ 'diff-gutter-actions--visible': busy }"
  >
    <button
      type="button"
      class="diff-gutter-btn diff-gutter-btn--revert"
      title="Discard change"
      aria-label="Discard change"
      :disabled="disabled"
      @click="emit('revert')"
    >
      <span v-if="busy" class="diff-gutter-spinner" />
      <svg
        v-else
        width="11"
        height="11"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          d="M3 8h7M6 5L3 8l3 3"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
    <button
      v-if="showStage"
      type="button"
      class="diff-gutter-btn diff-gutter-btn--stage"
      title="Stage change"
      aria-label="Stage change"
      :disabled="disabled"
      @click="emit('stage')"
    >
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor">
        <path d="M8 3v10M3 8h10" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <button
      v-if="showUnstage"
      type="button"
      class="diff-gutter-btn diff-gutter-btn--unstage"
      title="Unstage change"
      aria-label="Unstage change"
      :disabled="disabled"
      @click="emit('unstage')"
    >
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor">
        <path d="M3 8h10" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  </div>
</template>
