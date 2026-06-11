<script setup lang="ts">
import { computed } from "vue";
import { useWindowDrag } from "../composables/useWindowDrag";
import { formatPathFull, formatPathShort, formatTitleCompact, isShellExecutablePath } from "../lib/formatPath";
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

const oscTitle = computed(() => {
  const title = props.pane?.oscTitle?.trim() ?? "";
  if (!title || isShellExecutablePath(title)) return "";
  return title;
});

const fullDisplayTitle = computed(() =>
  manualTabTitle.value ? props.tabTitle : (oscTitle.value || shellLabel.value),
);

const displayTitle = computed(() => formatTitleCompact(fullDisplayTitle.value));

const shortCwd = computed(() => formatPathShort(props.pane?.cwd));

const cwdTooltip = computed(() => formatPathFull(props.pane?.cwd));
</script>

<template>
  <div
    class="drag-region flex h-9 shrink-0 items-center border-b border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-4"
    data-tauri-drag-region
    @mousedown="startDrag"
  >
    <span
      class="flex min-w-0 max-w-full items-center gap-0 truncate text-xs text-[var(--oterm-muted)]"
    >
      <span
        class="shrink-0 text-[var(--oterm-text)]"
        :title="fullDisplayTitle !== displayTitle ? fullDisplayTitle : undefined"
      >{{ displayTitle }}</span>
      <template v-if="shortCwd">
        <span class="shrink-0 text-[var(--oterm-faint)]"> / </span>
        <span
          class="min-w-0 truncate text-[var(--oterm-text)]"
          data-oterm-tooltip-variant="path"
          :title="cwdTooltip ?? undefined"
        >{{ shortCwd }}</span>
      </template>
    </span>
  </div>
</template>
