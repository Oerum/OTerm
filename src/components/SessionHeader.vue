<script setup lang="ts">
import { useWindowDrag } from "../composables/useWindowDrag";
import type { ShellProfile, WorkspacePane } from "../types/terminal";

defineProps<{
  pane: WorkspacePane | null;
  shells: ShellProfile[];
}>();

const { startDrag } = useWindowDrag();
</script>

<template>
  <div
    class="drag-region flex h-9 shrink-0 items-center border-b border-[var(--warp-border)] bg-[var(--warp-panel)] px-4"
    data-tauri-drag-region
    @mousedown="startDrag"
  >
    <span class="truncate text-xs text-[var(--warp-muted)]">
      {{
        shells.find((shell) => shell.id === pane?.shellId)?.label ?? "Terminal"
      }}
      <span class="text-[var(--warp-faint)]"> / </span>
      <span class="text-[var(--warp-text)]">{{ pane?.cwd ?? "~" }}</span>
    </span>
  </div>
</template>
