<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";

defineProps<{
  open: boolean;
  x: number;
  y: number;
  hash: string | null;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  copyHash: [];
  switch: [];
  openInBrowser: [];
  revert: [];
  resetMixed: [];
  resetHard: [];
  cherryPick: [];
  createBranch: [];
  createTag: [];
  squash: [];
  view: [];
}>();

const menuItemClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40";

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    emit("close");
  }
}

onMounted(() => window.addEventListener("keydown", onKeyDown));
onUnmounted(() => window.removeEventListener("keydown", onKeyDown));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && hash"
      class="fixed inset-0 z-[100]"
      @mousedown="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <div
        class="no-drag absolute min-w-44 rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-elevated)] py-1 shadow-xl"
        :style="{ left: `${x}px`, top: `${y}px` }"
        @mousedown.stop
        @contextmenu.stop.prevent
      >
        <button
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-text)] font-semibold']"
          @click="emit('view')"
        >
          View
        </button>
        <button
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-text)]']"
          @click="emit('copyHash')"
        >
          Copy hash
        </button>
        <button
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-text)]']"
          :disabled="busy"
          @click="emit('switch')"
        >
          Switch to detached HEAD
        </button>
        <button
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-text)]']"
          @click="emit('openInBrowser')"
        >
          Open in browser
        </button>
        <button
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-text)]']"
          :disabled="busy"
          @click="emit('revert')"
        >
          Revert
        </button>
        <button
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-text)]']"
          :disabled="busy"
          @click="emit('cherryPick')"
        >
          Cherry-pick
        </button>

        <div class="my-1 border-t border-[var(--oterm-border)]/60" />

        <button
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-text)]']"
          :disabled="busy"
          @click="emit('resetMixed')"
        >
          Reset (--mixed)
        </button>
        <button
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-text)]']"
          :disabled="busy"
          @click="emit('resetHard')"
        >
          Reset (--hard)
        </button>

        <div class="my-1 border-t border-[var(--oterm-border)]/60" />

        <button
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-text)]']"
          :disabled="busy"
          @click="emit('createBranch')"
        >
          New branch from here
        </button>
        <button
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-text)]']"
          :disabled="busy"
          @click="emit('createTag')"
        >
          New tag here
        </button>
        <button
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-text)]']"
          :disabled="busy"
          @click="emit('squash')"
        >
          Squash
        </button>
      </div>
    </div>
  </Teleport>
</template>
