<script setup lang="ts">
import { computed } from "vue";
import type { GitFileEntry } from "../types/git";
import { parseFilePath } from "../lib/gitFilePaths";
import GitFileLineStats from "./GitFileLineStats.vue";

const props = defineProps<{
  entry: GitFileEntry;
  hideDirPath?: boolean;
}>();

const parsed = computed(() => parseFilePath(props.entry.path));
</script>

<template>
  <div
    class="min-w-0 flex-1 py-0.5 flex items-baseline gap-1.5"
    style="font-family: var(--oterm-font-ui)"
  >
    <span class="truncate text-sm text-[var(--oterm-text)] font-medium">
      {{ parsed.fileName }}
    </span>
    <span v-if="!hideDirPath && parsed.dirPath" class="truncate text-[10px] text-[var(--oterm-faint)]">
      {{ parsed.dirPath }}
    </span>
  </div>
  <GitFileLineStats :additions="entry.additions" :deletions="entry.deletions" />
</template>
