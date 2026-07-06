<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";

const props = defineProps<{
  open: boolean;
  branch: string;
}>();

const emit = defineEmits<{
  createBranch: [];
  pushAnyway: [];
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
      document.getElementById("push-default-dialog-create")?.focus();
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
      aria-labelledby="push-default-dialog-title"
      aria-describedby="push-default-dialog-message"
      class="w-full max-w-sm overflow-hidden rounded-xl border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] shadow-2xl"
      @mousedown.stop
    >
      <div class="border-b border-[var(--oterm-border)] px-4 py-3">
        <h2 id="push-default-dialog-title" class="text-sm font-medium text-[var(--oterm-text)]">
          Push to Default Branch?
        </h2>
      </div>
      <p
        id="push-default-dialog-message"
        class="px-4 py-3 text-sm leading-relaxed text-[var(--oterm-muted)]"
      >
        You are trying to push directly to the default branch <strong>{{ branch }}</strong>. This is not recommended and can bypass code reviews.
      </p>
      <div class="flex justify-end gap-2 border-t border-[var(--oterm-border)] px-4 py-3 bg-[var(--oterm-bg)]/30">
        <button
          type="button"
          class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs text-[var(--oterm-text)] transition hover:bg-white/5"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-danger)]/15 px-3 py-1.5 text-xs font-medium text-[var(--oterm-danger)] transition hover:bg-[var(--oterm-danger)]/25"
          @click="emit('pushAnyway')"
        >
          Push Anyway
        </button>
        <button
          id="push-default-dialog-create"
          type="button"
          class="rounded-md bg-[var(--oterm-accent)]/15 px-3 py-1.5 text-xs font-medium text-[var(--oterm-accent)] transition hover:bg-[var(--oterm-accent)]/25"
          @click="emit('createBranch')"
        >
          Create Branch
        </button>
      </div>
    </div>
  </div>
</template>
