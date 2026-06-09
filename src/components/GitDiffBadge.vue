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
    ? 'bg-[var(--oterm-accent-dim)] text-[var(--oterm-accent)]'
    : 'text-[var(--oterm-muted)] hover:text-[var(--oterm-text)]',
];

const hasDiffStats = () =>
  props.gitStatus.changedFiles > 0 ||
  props.gitStatus.additions > 0 ||
  props.gitStatus.deletions > 0;

const hasSyncStats = () => props.gitStatus.ahead > 0 || props.gitStatus.behind > 0;

const badgeTitle = () => {
  const parts: string[] = [];
  if (props.gitStatus.ahead > 0) {
    parts.push(
      props.gitStatus.ahead === 1 ? "1 commit to push" : `${props.gitStatus.ahead} commits to push`,
    );
  }
  if (props.gitStatus.behind > 0) {
    parts.push(
      props.gitStatus.behind === 1 ? "1 commit behind remote" : `${props.gitStatus.behind} commits behind remote`,
    );
  }
  if (hasDiffStats()) {
    parts.push(`${props.gitStatus.changedFiles} changed file(s)`);
  }
  return parts.length ? parts.join(" · ") : props.active ? "Close source control" : "Open source control";
};
</script>

<template>
  <span
    v-if="gitStatus.isRepo && readonly"
    class="flex shrink-0 items-center gap-1 rounded font-mono"
    :class="badgeClass"
  >
    <template v-if="hasSyncStats() || hasDiffStats()">
      <span v-if="gitStatus.ahead > 0" class="text-[#58a6ff]">↑{{ gitStatus.ahead }}</span>
      <span v-if="gitStatus.behind > 0" class="text-[#e3b341]">↓{{ gitStatus.behind }}</span>
      <span v-if="gitStatus.changedFiles > 0" class="text-[var(--oterm-muted)]">{{ gitStatus.changedFiles }}</span>
      <span v-if="gitStatus.additions > 0" class="text-[#3dd68c]">+{{ gitStatus.additions }}</span>
      <span v-if="gitStatus.deletions > 0" class="text-[#ff7b72]">-{{ gitStatus.deletions }}</span>
    </template>
  </span>

  <button
    v-else-if="gitStatus.isRepo"
    type="button"
    class="no-drag flex shrink-0 items-center gap-1 rounded font-mono transition hover:bg-white/5"
    :class="badgeClass"
    :title="badgeTitle()"
    :aria-label="badgeTitle()"
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
    <template v-if="hasSyncStats() || hasDiffStats()">
      <span v-if="gitStatus.ahead > 0" class="text-[#58a6ff]">↑{{ gitStatus.ahead }}</span>
      <span v-if="gitStatus.behind > 0" class="text-[#e3b341]">↓{{ gitStatus.behind }}</span>
      <span v-if="gitStatus.changedFiles > 0" class="text-[var(--oterm-muted)]">{{ gitStatus.changedFiles }}</span>
      <span v-if="gitStatus.additions > 0" class="text-[#3dd68c]">+{{ gitStatus.additions }}</span>
      <span v-if="gitStatus.deletions > 0" class="text-[#ff7b72]">-{{ gitStatus.deletions }}</span>
    </template>
    <span v-else-if="compact" class="text-[var(--oterm-faint)]">0</span>
  </button>
</template>
