<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

defineProps<{
  appVersion: string;
}>();

const emit = defineEmits<{
  openSettings: [];
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);

function toggle() {
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function onSettings() {
  emit("openSettings");
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
        open
          ? 'border-[#42D96B]/50 bg-[var(--warp-accent-dim)] text-[#7EF2D1]'
          : 'border-white/10 text-[var(--warp-muted)] hover:border-white/20 hover:text-[#F5F5F7]'
      "
      aria-label="User menu"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="toggle"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
        <circle cx="8" cy="5.5" r="2.25" stroke-width="1.4" />
        <path
          d="M3.5 13.5c0-2.485 2.015-4.5 4.5-4.5s4.5 2.015 4.5 4.5"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      </svg>
    </button>

    <div
      v-if="open"
      role="menu"
      class="absolute right-0 top-full z-50 mt-1.5 min-w-[10.5rem] overflow-hidden rounded-lg border border-[var(--warp-border-strong)] bg-[var(--warp-elevated)] py-1 shadow-xl"
      @mousedown.stop
    >
      <button
        type="button"
        role="menuitem"
        class="flex w-full px-3 py-1.5 text-left text-xs text-[var(--warp-text)] transition hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none"
        @click="onSettings"
      >
        Settings
      </button>
      <div role="separator" class="mt-1 border-t border-[var(--warp-border)]" />

      <p class="px-3 py-1.5 text-center font-mono text-[10px] tracking-wide text-[var(--warp-faint)]">
        v{{ appVersion }}
      </p>
    </div>
  </div>
</template>
