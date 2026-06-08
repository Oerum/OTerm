<script setup lang="ts">
import type { GitStatus } from "../types/git";

const props = defineProps<{
  gitStatus: GitStatus;
  active?: boolean;
  compact?: boolean;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  click: [];
}>();

const badgeClass = [
  props.compact ? 'px-1 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-[11px]',
  props.active
    ? 'bg-[var(--warp-accent-dim)] text-[var(--warp-accent)]'
    : 'text-[var(--warp-muted)] hover:text-[var(--warp-text)]',
];
</script>

<template>
  <span
    v-if="gitStatus.isRepo && readonly"
    class="flex shrink-0 items-center gap-1 rounded font-mono"
    :class="badgeClass"
  >
    <template v-if="gitStatus.changedFiles > 0 || gitStatus.additions > 0 || gitStatus.deletions > 0">
      <span v-if="gitStatus.changedFiles > 0" class="text-[var(--warp-muted)]">{{ gitStatus.changedFiles }}</span>
      <span v-if="gitStatus.additions > 0" class="text-[#3dd68c]">+{{ gitStatus.additions }}</span>
      <span v-if="gitStatus.deletions > 0" class="text-[#ff7b72]">-{{ gitStatus.deletions }}</span>
    </template>
  </span>

  <button
    v-else-if="gitStatus.isRepo"
    type="button"
    class="no-drag flex shrink-0 items-center gap-1 rounded font-mono transition hover:bg-white/5"
    :class="badgeClass"
    :title="active ? 'Close source control' : 'Open source control'"
    :aria-label="active ? 'Close source control' : 'Open source control'"
    @click="emit('click')"
  >
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      class="shrink-0"
      aria-hidden="true"
    >
      <circle cx="4.5" cy="4.5" r="1.5" stroke-width="1.2" />
      <circle cx="11.5" cy="11.5" r="1.5" stroke-width="1.2" />
      <path d="M6 4.5h3.5a2 2 0 0 1 2 2V9" stroke-width="1.2" stroke-linecap="round" />
    </svg>
    <span v-if="gitStatus.branch && !compact" class="max-w-[8rem] truncate">{{ gitStatus.branch }}</span>
    <template v-if="gitStatus.changedFiles > 0 || gitStatus.additions > 0 || gitStatus.deletions > 0">
      <span v-if="gitStatus.changedFiles > 0" class="text-[var(--warp-muted)]">{{ gitStatus.changedFiles }}</span>
      <span v-if="gitStatus.additions > 0" class="text-[#3dd68c]">+{{ gitStatus.additions }}</span>
      <span v-if="gitStatus.deletions > 0" class="text-[#ff7b72]">-{{ gitStatus.deletions }}</span>
    </template>
    <span v-else-if="compact" class="text-[var(--warp-faint)]">0</span>
  </button>
</template>
