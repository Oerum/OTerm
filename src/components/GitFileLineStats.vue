<script setup lang="ts">
defineProps<{
  additions: number;
  deletions: number;
}>();
</script>

<template>
  <span
    v-if="additions > 0 || deletions > 0"
    class="flex shrink-0 items-center gap-0.5 font-mono text-[11px] tabular-nums"
  >
    <span v-if="additions > 0" class="text-[#3dd68c]">+{{ additions }}</span>
    <span v-if="deletions > 0" class="text-[#ff7b72]">-{{ deletions }}</span>
  </span>
</template>
