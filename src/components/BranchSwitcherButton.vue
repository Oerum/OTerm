<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { GitBranchList, GitStatus } from "../types/git";

const props = defineProps<{
  gitStatus: GitStatus;
  branches: GitBranchList;
  busy?: boolean;
  compact?: boolean;
  anchorUp?: boolean;
  worktreeHint?: { path: string; branch: string | null } | null;
}>();

const buttonTitle = computed(() => {
  const base = `Switch branch (${currentLabel.value})`;
  return props.worktreeHint ? `${base} — linked worktree` : base;
});

const worktreeHeader = computed(() => {
  if (!props.worktreeHint) return null;
  const branch = props.worktreeHint.branch ?? "detached";
  return `Linked worktree · ${branch}`;
});

const emit = defineEmits<{
  switch: [branch: string, isRemote: boolean];
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);

const currentLabel = computed(() => props.gitStatus.branch ?? "detached");

const menuItemClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none";

function toggle() {
  if (props.busy || !props.gitStatus.isRepo) return;
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function selectBranch(branch: string, isRemote: boolean) {
  close();
  emit("switch", branch, isRemote);
}

function isCurrentLocal(branch: string) {
  return branch === props.gitStatus.branch;
}

function onDocumentMouseDown(event: MouseEvent) {
  if (!open.value) return;
  const target = event.target;
  if (target instanceof Node && rootRef.value?.contains(target)) return;
  close();
}

function onKeyDown(event: KeyboardEvent) {
  if (!open.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
}

onMounted(() => {
  document.addEventListener("mousedown", onDocumentMouseDown);
  window.addEventListener("keydown", onKeyDown);
});

onUnmounted(() => {
  document.removeEventListener("mousedown", onDocumentMouseDown);
  window.removeEventListener("keydown", onKeyDown);
});
</script>

<template>
  <div v-if="gitStatus.isRepo" ref="rootRef" class="relative shrink-0">
    <button
      type="button"
      class="no-drag flex shrink-0 items-center gap-1 rounded font-mono btn-premium disabled:cursor-not-allowed disabled:opacity-40"
      :class="
        compact
          ? 'max-w-[7rem] px-1 py-0.5 text-[10px] text-[var(--oterm-muted)] hover:text-[var(--oterm-text)]'
          : 'max-w-[10rem] px-1.5 py-0.5 text-[11px] text-[var(--oterm-muted)] hover:text-[var(--oterm-text)]'
      "
      :title="buttonTitle"
      :aria-label="buttonTitle"
      :aria-expanded="open"
      aria-haspopup="menu"
      :disabled="busy"
      @click="toggle"
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
        <path
          d="M4 2.5h5.5a1.5 1.5 0 0 1 1.5 1.5v2M4 13.5h5.5a1.5 1.5 0 0 0 1.5-1.5v-2M2.5 8h11"
          stroke-width="1.2"
          stroke-linecap="round"
        />
      </svg>
      <span class="truncate">{{ currentLabel }}</span>
      <svg
        width="8"
        height="8"
        viewBox="0 0 8 8"
        fill="none"
        stroke="currentColor"
        class="shrink-0 opacity-60"
        aria-hidden="true"
      >
        <path d="M1.5 2.5 4 5l2.5-2.5" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    </button>

    <div
      v-if="open"
      role="menu"
      class="oterm-scroll glass-panel absolute right-0 z-50 max-h-72 min-w-[12rem] overflow-y-auto rounded-lg py-1"
      :class="anchorUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'"
      @mousedown.stop
    >
      <p
        v-if="worktreeHeader"
        class="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--oterm-faint)]"
        style="font-family: var(--oterm-font-ui)"
      >
        {{ worktreeHeader }}
      </p>

      <p
        v-if="!branches.local.length && !branches.remote.length"
        class="px-3 py-2 text-xs text-[var(--oterm-faint)]"
        style="font-family: var(--oterm-font-ui)"
      >
        No branches
      </p>

      <template v-if="branches.local.length">
        <p
          class="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--oterm-faint)]"
          style="font-family: var(--oterm-font-ui)"
        >
          Local
        </p>
        <button
          v-for="branch in branches.local"
          :key="`local:${branch}`"
          type="button"
          role="menuitem"
          :class="[
            menuItemClass,
            isCurrentLocal(branch)
              ? 'text-[var(--oterm-accent)]'
              : 'text-[var(--oterm-text)]',
          ]"
          :disabled="busy"
          @click="selectBranch(branch, false)"
        >
          <span class="truncate">{{ branch }}</span>
        </button>
      </template>

      <template v-if="branches.remote.length">
        <p
          class="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--oterm-faint)]"
          :class="branches.local.length ? 'mt-1 border-t border-[var(--oterm-border)]/60 pt-2' : ''"
          style="font-family: var(--oterm-font-ui)"
        >
          Remote
        </p>
        <button
          v-for="branch in branches.remote"
          :key="`remote:${branch}`"
          type="button"
          role="menuitem"
          :class="[menuItemClass, 'text-[var(--oterm-text)]']"
          :disabled="busy"
          @click="selectBranch(branch, true)"
        >
          <span class="truncate">{{ branch }}</span>
        </button>
      </template>
    </div>
  </div>
</template>
