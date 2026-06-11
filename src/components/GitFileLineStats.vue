<script setup lang="ts">
defineProps<{
  additions: number;
  deletions: number;
}>();
</script>

<template>
  <div
    v-if="additions > 0 || deletions > 0"
    class="flex shrink-0 items-center gap-1.5"
  >
    <span class="font-mono text-[10px] tabular-nums text-[var(--oterm-faint)]">
      {{ additions + deletions }}
    </span>
    <div class="flex h-1.5 w-10 overflow-hidden rounded bg-white/[0.06]" aria-hidden="true">
      <div
        v-if="additions > 0"
        class="bg-[#3dd68c]"
        :style="{ width: `${(additions / (additions + deletions)) * 100}%` }"
      />
      <div
        v-if="deletions > 0"
        class="bg-[var(--oterm-danger)]"
        :style="{ width: `${(deletions / (additions + deletions)) * 100}%` }"
      />
    </div>
  </div>
</template>
