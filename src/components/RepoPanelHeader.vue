<script setup lang="ts">
defineProps<{
  repoRoot?: string;
  /** Extra classes on the outer `<header>` (padding variants, etc.). */
  headerClass?: string;
}>();
</script>

<template>
  <header
    class="flex shrink-0 items-center gap-3 border-b border-[var(--oterm-border)] bg-[var(--oterm-panel)]"
    :class="headerClass ?? 'px-4 py-3'"
  >
    <div class="flex min-w-0 items-center gap-2">
      <slot name="icon" />
      <slot name="title" />
      <span
        v-if="repoRoot"
        class="max-w-[200px] truncate font-mono text-xs text-[var(--oterm-faint)]"
        :title="repoRoot"
      >
        {{ repoRoot }}
      </span>
    </div>
    <div class="flex-1" />
    <div class="flex flex-wrap items-center gap-3">
      <slot />
    </div>
  </header>
</template>
