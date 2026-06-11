<script setup lang="ts">
import { computed, onUnmounted, watch } from "vue";

const MENU_WIDTH = 220;
const MENU_MARGIN = 8;

const props = defineProps<{
  open: boolean;
  x: number;
  y: number;
  path: string | null;
  isUrl: boolean;
  hasSelection: boolean;
}>();

const emit = defineEmits<{
  close: [];
  copy: [];
  append: [];
  open: [];
  copySelection: [];
  paste: [];
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
  const height = props.path ? 120 : 60;
  const left =
    props.x + MENU_WIDTH > window.innerWidth
      ? Math.max(MENU_MARGIN, window.innerWidth - MENU_WIDTH - MENU_MARGIN)
      : props.x;
  const top =
    props.y + height > window.innerHeight
      ? Math.max(MENU_MARGIN, window.innerHeight - height - MENU_MARGIN)
      : props.y;
  return { left: `${left}px`, top: `${top}px` };
});

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    emit("close");
  }
}

watch(
  () => props.open,
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
      v-if="open"
      class="fixed inset-0 z-[100]"
      @mousedown="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <div
        class="no-drag absolute min-w-52 rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-elevated)] py-1 shadow-xl"
        :style="menuStyle"
        @mousedown.stop
        @contextmenu.stop.prevent
      >
        <template v-if="path">
          <button
            v-if="isUrl"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--oterm-text)] transition hover:bg-white/[0.06]"
            @click="emit('open')"
          >
            Open in browser
          </button>
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs text-[var(--oterm-text)] transition hover:bg-white/[0.06]"
            @click="emit('append')"
          >
            <span>Append to current command</span>
            <span class="shrink-0 text-[var(--oterm-faint)]">({{ modifierLabel }} + Click)</span>
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--oterm-text)] transition hover:bg-white/[0.06]"
            @click="emit('copy')"
          >
            Copy link/path
          </button>
          <div class="my-1 border-t border-[var(--oterm-border)]/60" />
        </template>

        <button
          type="button"
          :disabled="!hasSelection"
          class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition enabled:text-[var(--oterm-text)] disabled:text-[var(--oterm-faint)] enabled:hover:bg-white/[0.06]"
          @click="emit('copySelection')"
        >
          <span>Copy</span>
          <span class="shrink-0 text-[var(--oterm-faint)]">{{ modifierLabel }} + C</span>
        </button>
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-[var(--oterm-text)] transition hover:bg-white/[0.06]"
          @click="emit('paste')"
        >
          <span>Paste</span>
          <span class="shrink-0 text-[var(--oterm-faint)]">{{ modifierLabel }} + V</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>
