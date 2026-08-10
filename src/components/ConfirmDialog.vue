<script setup lang="ts">
import { useDialogEscapeFocus } from "../composables/useDialogEscapeFocus";

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

useDialogEscapeFocus(() => props.open, () => emit("cancel"), "confirm-dialog-confirm");
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
      class="w-full max-w-sm overflow-hidden rounded-xl border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] shadow-2xl"
      @mousedown.stop
    >
      <div class="border-b border-[var(--oterm-border)] px-4 py-3">
        <h2 id="confirm-dialog-title" class="text-sm font-medium text-[var(--oterm-text)]">
          {{ title }}
        </h2>
      </div>
      <p
        id="confirm-dialog-message"
        class="px-4 py-3 text-sm leading-relaxed text-[var(--oterm-muted)]"
      >
        {{ message }}
      </p>
      <div class="flex justify-end gap-2 border-t border-[var(--oterm-border)] px-4 py-3">
        <button
          type="button"
          class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs text-[var(--oterm-text)] transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oterm-accent)]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--oterm-elevated)]"
          @click="emit('cancel')"
        >
          {{ cancelLabel }}
        </button>
        <button
          id="confirm-dialog-confirm"
          type="button"
          class="rounded-md px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oterm-accent)]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--oterm-elevated)]"
          :class="
            dangerous
              ? 'bg-[var(--oterm-danger)]/15 text-[var(--oterm-danger)] hover:bg-[var(--oterm-danger)]/25'
              : 'bg-[var(--oterm-accent)]/15 text-[var(--oterm-accent)] hover:bg-[var(--oterm-accent)]/25'
          "
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
