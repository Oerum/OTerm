<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import type { FsEntry } from "../types/fs";

defineProps<{
  open: boolean;
  x: number;
  y: number;
  entry: FsEntry | null;
  shellMenuAvailable: boolean;
}>();

const emit = defineEmits<{
  close: [];
  cd: [];
  shellMenu: [];
  open: [];
}>();

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    emit("close");
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && entry"
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
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--oterm-text)] transition hover:bg-white/[0.06]"
          @click="emit('cd')"
        >
          Cd in terminal
        </button>
        <button
          v-if="shellMenuAvailable"
          type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--oterm-text)] transition hover:bg-white/[0.06]"
          @click="emit('shellMenu')"
        >
          System context menu
        </button>
        <button
          v-if="!entry.isDir"
          type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--oterm-text)] transition hover:bg-white/[0.06]"
          @click="emit('open')"
        >
          Open
        </button>
      </div>
    </div>
  </Teleport>
</template>
