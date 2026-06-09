<script setup lang="ts">
import { computed } from "vue";
import { useWindowDrag } from "../composables/useWindowDrag";
import type { ShellProfile, WorkspacePane } from "../types/terminal";

const props = defineProps<{
  pane: WorkspacePane | null;
  shells: ShellProfile[];
  tabTitle: string;
}>();

const { startDrag } = useWindowDrag();

const shellLabel = computed(
  () => props.shells.find((shell) => shell.id === props.pane?.shellId)?.label ?? "Terminal",
);

const manualTabTitle = computed(() => props.tabTitle !== "Terminal");

const oscTitle = computed(() => props.pane?.oscTitle?.trim() ?? "");
</script>

<template>
  <div
    class="drag-region flex h-9 shrink-0 items-center border-b border-[var(--warp-border)] bg-[var(--warp-panel)] px-4"
    data-tauri-drag-region
    @mousedown="startDrag"
  >
    <span class="truncate text-xs text-[var(--warp-muted)]">
      <span class="text-[var(--warp-text)]">
        {{ manualTabTitle ? tabTitle : (oscTitle || shellLabel) }}
      </span>
      <span class="text-[var(--warp-faint)]"> / </span>
      <span class="text-[var(--warp-text)]">{{ pane?.cwd ?? "~" }}</span>
    </span>
  </div>
</template>
