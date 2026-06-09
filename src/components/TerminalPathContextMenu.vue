<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";

const props = defineProps<{
  open: boolean;
  x: number;
  y: number;
  path: string | null;
  isUrl: boolean;
}>();

const emit = defineEmits<{
  close: [];
  copy: [];
  append: [];
  open: [];
}>();

const modifierLabel = computed(() =>
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
    ? "Cmd"
    : "Ctrl",
);

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
      v-if="open && path"
      class="fixed inset-0 z-[100]"
      @mousedown="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <div
        class="no-drag absolute min-w-52 rounded-lg border border-[var(--warp-border)] bg-[var(--warp-elevated)] py-1 shadow-xl"
        :style="{ left: `${x}px`, top: `${y}px` }"
        @mousedown.stop
        @contextmenu.stop.prevent
      >
        <button
          v-if="isUrl"
          type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--warp-text)] transition hover:bg-white/[0.06]"
          @click="emit('open')"
        >
          Open in browser
        </button>
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs text-[var(--warp-text)] transition hover:bg-white/[0.06]"
          @click="emit('append')"
        >
          <span>Append to current command</span>
          <span class="shrink-0 text-[var(--warp-faint)]">({{ modifierLabel }} + Click)</span>
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--warp-text)] transition hover:bg-white/[0.06]"
          @click="emit('copy')"
        >
          Copy
        </button>
      </div>
    </div>
  </Teleport>
</template>
