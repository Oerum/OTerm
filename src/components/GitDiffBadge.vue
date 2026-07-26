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
const formatStat = (n: number): string => {
  if (n >= 1000) {
    return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return n.toString();
};

const showStats = () => hasSyncStats() || hasDiffStats();

function onClick() {
  if (!props.readonly) emit("click");
}
</script>

<template>
  <component
    :is="readonly ? 'span' : 'button'"
    v-if="gitStatus.isRepo"
    :type="readonly ? undefined : 'button'"
    class="flex shrink-0 items-center gap-1 rounded font-mono"
    :class="[
      badgeClass,
      readonly ? '' : 'no-drag transition hover:bg-white/5',
    ]"
    :title="readonly ? undefined : badgeTitle()"
    :aria-label="readonly ? undefined : badgeTitle()"
    @click="onClick"
  >
    <svg
      v-if="!readonly"
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

    <template v-if="showStats()">
      <span v-if="gitStatus.ahead > 0" class="text-[#58a6ff]">↑{{ formatStat(gitStatus.ahead) }}</span>
      <span v-if="gitStatus.behind > 0" class="text-[#e3b341]">↓{{ formatStat(gitStatus.behind) }}</span>
      <span v-if="gitStatus.changedFiles > 0" class="text-[var(--oterm-muted)]">{{ formatStat(gitStatus.changedFiles) }}</span>
      <span v-if="gitStatus.additions > 0" class="text-[#3dd68c]">+{{ formatStat(gitStatus.additions) }}</span>
      <span v-if="gitStatus.deletions > 0" class="text-[#ff7b72]">-{{ formatStat(gitStatus.deletions) }}</span>
    </template>
    <span v-else-if="!readonly && compact" class="text-[var(--oterm-faint)]">0</span>
  </component>
</template>
