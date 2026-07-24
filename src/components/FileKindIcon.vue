<script setup lang="ts">
import { computed } from "vue";
import { getFileType } from "../lib/fileTypes";

const props = withDefaults(
  defineProps<{
    name: string;
    isDir: boolean;
    sizeClass?: string;
  }>(),
  {
    sizeClass: "w-4 h-4",
  },
);

const type = computed(() => getFileType(props.name, props.isDir));
</script>

<template>
  <svg v-if="type === 'dir'" :class="[sizeClass, 'text-amber-400']" fill="currentColor" viewBox="0 0 24 24">
    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
  </svg>
  <svg v-else-if="type === 'archive'" :class="[sizeClass, 'text-purple-400']" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="12" y1="3" x2="12" y2="21" />
    <path d="M12 7h3M9 11h6M9 15h3" />
  </svg>
  <svg v-else-if="type === 'media'" :class="[sizeClass, 'text-emerald-400']" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
  <svg v-else-if="type === 'code'" :class="[sizeClass, 'text-cyan-400']" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
  <svg v-else :class="[sizeClass, 'text-zinc-400']" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
</template>
