<script setup lang="ts">
defineProps<{
  loading?: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  close: [];
}>();
</script>

<template>
  <div class="flex items-center gap-2">
    <slot />
    <button
      type="button"
      class="pr-header-btn"
      :disabled="loading || busy"
      @click="emit('refresh')"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        :class="{ 'animate-spin': loading }"
      >
        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
      </svg>
      Refresh
    </button>
    <button type="button" class="pr-header-btn" @click="emit('close')">Close</button>
  </div>
</template>

<style scoped>
.pr-header-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  border-radius: 0.5rem;
  border: 1px solid var(--oterm-border);
  padding: 0.375rem 0.75rem;
  font-size: 0.6875rem;
  font-weight: 600;
  font-family: var(--oterm-font-ui);
  color: var(--oterm-muted);
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
}

.pr-header-btn:hover:not(:disabled) {
  border-color: var(--oterm-border-strong);
  background: rgba(255, 255, 255, 0.06);
  color: var(--oterm-text);
}

.pr-header-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
