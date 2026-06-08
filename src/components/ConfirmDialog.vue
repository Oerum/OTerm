<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    dangerous?: boolean;
  }>(),
  {
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    dangerous: false,
  },
);

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

function onKeyDown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === "Escape") {
    event.preventDefault();
    emit("cancel");
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    window.setTimeout(() => {
      document.getElementById("confirm-dialog-confirm")?.focus();
    }, 0);
  },
);

onMounted(() => window.addEventListener("keydown", onKeyDown));
onUnmounted(() => window.removeEventListener("keydown", onKeyDown));
</script>

<template>
  <div
    v-if="open"
    class="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
    @click.self="emit('cancel')"
  >
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      class="w-full max-w-sm overflow-hidden rounded-xl border border-[var(--warp-border-strong)] bg-[var(--warp-elevated)] shadow-2xl"
      @mousedown.stop
    >
      <div class="border-b border-[var(--warp-border)] px-4 py-3">
        <h2 id="confirm-dialog-title" class="text-sm font-medium text-[var(--warp-text)]">
          {{ title }}
        </h2>
      </div>
      <p
        id="confirm-dialog-message"
        class="px-4 py-3 text-sm leading-relaxed text-[var(--warp-muted)]"
      >
        {{ message }}
      </p>
      <div class="flex justify-end gap-2 border-t border-[var(--warp-border)] px-4 py-3">
        <button
          type="button"
          class="rounded-md border border-[var(--warp-border)] px-3 py-1.5 text-xs text-[var(--warp-text)] transition hover:bg-white/5"
          @click="emit('cancel')"
        >
          {{ cancelLabel }}
        </button>
        <button
          id="confirm-dialog-confirm"
          type="button"
          class="rounded-md px-3 py-1.5 text-xs font-medium transition"
          :class="
            dangerous
              ? 'bg-[var(--warp-danger)]/15 text-[var(--warp-danger)] hover:bg-[var(--warp-danger)]/25'
              : 'bg-[var(--warp-accent)]/15 text-[var(--warp-accent)] hover:bg-[var(--warp-accent)]/25'
          "
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
