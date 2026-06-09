<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import gitIcon from "../assets/git/Git.svg";

const props = defineProps<{
  canOpenGitFeatures: boolean;
}>();

const emit = defineEmits<{
  openPullRequests: [];
  openIssues: [];
  openBranchManager: [];
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);

const menuItemClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--oterm-text)] transition hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none";

function toggle() {
  if (!props.canOpenGitFeatures) return;
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function onPullRequests() {
  emit("openPullRequests");
  close();
}

function onIssues() {
  emit("openIssues");
  close();
}

function onBranchManager() {
  emit("openBranchManager");
  close();
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
  <div ref="rootRef" class="relative">
    <button
      type="button"
      class="flex h-6 w-6 items-center justify-center rounded-full border transition"
      :class="
        canOpenGitFeatures
          ? open
            ? 'border-[#42D96B]/50 bg-[var(--oterm-accent-dim)] text-[#7EF2D1]'
            : 'border-white/10 text-[var(--oterm-muted)] hover:border-white/20 hover:text-[#F5F5F7]'
          : 'cursor-not-allowed border-white/10 text-[var(--oterm-muted)]/40'
      "
      title="Git"
      aria-label="Git menu"
      :aria-expanded="open"
      aria-haspopup="menu"
      :disabled="!canOpenGitFeatures"
      @click="toggle"
    >
      <img
        :src="gitIcon"
        class="h-3.5 w-3.5 shrink-0 transition-[filter,opacity]"
        :class="canOpenGitFeatures ? 'opacity-100' : 'opacity-40 grayscale'"
        alt=""
        draggable="false"
      />
    </button>

    <div
      v-if="open"
      role="menu"
      class="absolute right-0 top-full z-50 mt-1.5 min-w-[10.5rem] overflow-hidden rounded-lg border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] py-1 shadow-xl"
      @mousedown.stop
    >
      <button type="button" role="menuitem" :class="menuItemClass" @click="onPullRequests">
        <svg
          class="h-3.5 w-3.5 shrink-0 opacity-80"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"
          />
        </svg>
        PRs
      </button>
      <button type="button" role="menuitem" :class="menuItemClass" @click="onIssues">
        <svg
          class="h-3.5 w-3.5 shrink-0 opacity-80"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
          <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
        </svg>
        Issues
      </button>
      <button type="button" role="menuitem" :class="menuItemClass" @click="onBranchManager">
        <svg
          class="h-3.5 w-3.5 shrink-0 opacity-80"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"
          />
        </svg>
        Branches
      </button>
    </div>
  </div>
</template>
