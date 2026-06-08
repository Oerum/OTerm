<script setup lang="ts">
import type { ShellProfile, WorkspacePane } from "../types/terminal";

defineProps<{
  pane: WorkspacePane | null;
  shells: ShellProfile[];
}>();
</script>

<template>
  <footer
    class="flex h-8 shrink-0 items-center justify-between border-t border-[var(--warp-border)] bg-[var(--warp-panel)] px-4 text-[11px] text-[var(--warp-faint)]"
  >
    <div class="flex min-w-0 items-center gap-2">
      <span class="text-[var(--warp-accent)]">›</span>
      <span class="truncate text-[var(--warp-muted)]">
        {{ pane?.cwd ?? "~" }}
      </span>
    </div>
    <div class="hidden items-center gap-4 sm:flex">
      <span>
        {{
          shells.find((shell) => shell.id === pane?.shellId)?.label ?? "Shell"
        }}
      </span>
      <span class="text-[var(--warp-faint)]">Ctrl+R history</span>
    </div>
  </footer>
</template>
