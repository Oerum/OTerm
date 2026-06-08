<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWindowDrag } from "../composables/useWindowDrag";

defineProps<{
  terminalSidebarOpen: boolean;
  toolsOpen: boolean;
}>();

const emit = defineEmits<{
  toggleTerminalSidebar: [];
  toggleTools: [];
}>();

const appWindow = getCurrentWindow();
const { startDrag } = useWindowDrag();

function onDragMouseDown(event: MouseEvent) {
  if (event.detail === 2) {
    void appWindow.toggleMaximize();
    return;
  }
  startDrag(event);
}
</script>

<template>
  <header
    class="flex h-9 shrink-0 items-center border-b border-[var(--warp-border)] bg-[var(--warp-titlebar)]"
  >
    <div class="no-drag flex items-center gap-0.5 px-1.5">
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-md transition"
        :class="
          terminalSidebarOpen
            ? 'bg-[var(--warp-accent-dim)] text-[var(--warp-accent)]'
            : 'text-[var(--warp-muted)] hover:bg-white/5 hover:text-[var(--warp-text)]'
        "
        title="Toggle terminal sidebar"
        aria-label="Toggle terminal sidebar"
        @click="emit('toggleTerminalSidebar')"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path
            d="M3 4.5 6.5 8 3 11.5M8 11.5h5"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-md transition"
        :class="
          toolsOpen
            ? 'bg-[var(--warp-accent-dim)] text-[var(--warp-accent)]'
            : 'text-[var(--warp-muted)] hover:bg-white/5 hover:text-[var(--warp-text)]'
        "
        title="Toggle tools sidebar"
        aria-label="Toggle tools sidebar"
        @click="emit('toggleTools')"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path d="M2.5 4h11M2.5 8h11M2.5 12h7" stroke-width="1.3" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div
      class="drag-region min-w-0 flex-1 self-stretch"
      data-tauri-drag-region
      @mousedown="onDragMouseDown"
    />

    <div class="no-drag flex items-center">
      <button
        type="button"
        class="flex h-9 w-11 items-center justify-center text-[var(--warp-muted)] transition hover:bg-white/5 hover:text-[var(--warp-text)]"
        aria-label="Minimize"
        @click="appWindow.minimize()"
      >
        <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
          <rect width="10" height="1" />
        </svg>
      </button>
      <button
        type="button"
        class="flex h-9 w-11 items-center justify-center text-[var(--warp-muted)] transition hover:bg-white/5 hover:text-[var(--warp-text)]"
        aria-label="Maximize"
        @click="appWindow.toggleMaximize()"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
          <rect x="0.5" y="0.5" width="9" height="9" stroke-width="1" />
        </svg>
      </button>
      <button
        type="button"
        class="flex h-9 w-11 items-center justify-center text-[var(--warp-muted)] transition hover:bg-[var(--warp-danger)] hover:text-white"
        aria-label="Close"
        @click="appWindow.close()"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
          <path d="M1 1l8 8M9 1L1 9" stroke-width="1.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </header>
</template>
