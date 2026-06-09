<script setup lang="ts">
import { computed, onUnmounted, watch } from "vue";

const MENU_WIDTH = 220;
const MENU_HEIGHT = 120;
const MENU_MARGIN = 8;

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

const menuStyle = computed(() => {
  if (typeof window === "undefined") {
    return { left: `${props.x}px`, top: `${props.y}px` };
  }
  const left =
    props.x + MENU_WIDTH > window.innerWidth
      ? Math.max(MENU_MARGIN, window.innerWidth - MENU_WIDTH - MENU_MARGIN)
      : props.x;
  const top =
    props.y + MENU_HEIGHT > window.innerHeight
      ? Math.max(MENU_MARGIN, window.innerHeight - MENU_HEIGHT - MENU_MARGIN)
      : props.y;
  return { left: `${left}px`, top: `${top}px` };
});

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    emit("close");
  }
}

watch(
  () => props.open && props.path,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener("keydown", onKeyDown);
    } else {
      window.removeEventListener("keydown", onKeyDown);
    }
  },
  { immediate: true },
);

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
        :style="menuStyle"
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
