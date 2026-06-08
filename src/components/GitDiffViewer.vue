<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  content: string;
  loading?: boolean;
  error?: string | null;
}>();

type DiffLineKind = "header" | "hunk" | "add" | "remove" | "context";

interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

function classifyLine(line: string): DiffLineKind {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ")) {
    return "header";
  }
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "remove";
  return "context";
}

const lines = computed<DiffLine[]>(() => {
  if (!props.content.trim()) return [];
  return props.content.split("\n").map((text) => ({
    kind: classifyLine(text),
    text,
  }));
});

function lineClass(kind: DiffLineKind) {
  switch (kind) {
    case "add":
      return "bg-[#3dd68c]/10 text-[#3dd68c]";
    case "remove":
      return "bg-[#ff7b72]/10 text-[#ff7b72]";
    case "hunk":
      return "text-[var(--warp-accent)]";
    case "header":
      return "text-[var(--warp-faint)]";
    default:
      return "text-[var(--warp-muted)]";
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-[var(--warp-bg)]">
    <div v-if="loading" class="px-3 py-4 text-sm text-[var(--warp-faint)]">Loading diff…</div>
    <div v-else-if="error" class="px-3 py-4 text-sm text-[#ff7b72]">{{ error }}</div>
    <div
      v-else-if="!content.trim()"
      class="px-3 py-4 text-sm text-[var(--warp-faint)]"
    >
      No diff to display
    </div>
    <pre
      v-else
      class="warp-scroll min-h-0 flex-1 overflow-auto p-2 text-xs leading-relaxed"
      style="font-family: var(--warp-font-mono)"
    ><code
      v-for="(line, index) in lines"
      :key="index"
      class="block whitespace-pre"
      :class="lineClass(line.kind)"
    >{{ line.text }}</code></pre>
  </div>
</template>
