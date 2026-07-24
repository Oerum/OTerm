<script setup lang="ts">
import type { GitFileEntry } from "../types/git";
import { parseFilePath } from "../lib/gitFilePaths";
import GitFileLineStats from "./GitFileLineStats.vue";

defineProps<{
  entry: GitFileEntry;
}>();
</script>

<template>
  <div
    class="min-w-0 flex-1 py-0.5 flex items-baseline gap-1.5"
    style="font-family: var(--oterm-font-ui)"
  >
    <span class="truncate text-sm text-[var(--oterm-text)] font-medium">
      {{ parseFilePath(entry.path).fileName }}
    </span>
    <span class="truncate text-[10px] text-[var(--oterm-faint)]">
      {{ parseFilePath(entry.path).dirPath }}
    </span>
  </div>
  <GitFileLineStats :additions="entry.additions" :deletions="entry.deletions" />
</template>
