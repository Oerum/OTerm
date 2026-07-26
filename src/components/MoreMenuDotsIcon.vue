<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number;
  }>(),
  { size: 10 },
);
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 10 10" aria-hidden="true">
    <circle cx="5" cy="2" r="0.9" fill="currentColor" />
    <circle cx="5" cy="5" r="0.9" fill="currentColor" />
    <circle cx="5" cy="8" r="0.9" fill="currentColor" />
  </svg>
</template>
