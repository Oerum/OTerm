<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    name: string;
    message: string;
    targetLabel: string;
    pushToOrigin: boolean;
    hasOrigin?: boolean;
    submitDisabled?: boolean;
    error?: string | null;
  }>(),
  {
    hasOrigin: false,
    submitDisabled: false,
    error: null,
  },
);

const emit = defineEmits<{
  "update:name": [value: string];
  "update:message": [value: string];
  "update:push-to-origin": [value: boolean];
  confirm: [];
  cancel: [];
}>();

const inputRef = ref<HTMLInputElement | null>(null);

const fieldClass =
  "w-full min-w-0 rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2.5 py-1.5 text-sm text-[var(--oterm-text)] outline-none transition focus:border-[var(--oterm-accent)]/50 disabled:cursor-not-allowed disabled:opacity-50";

function onKeyDown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === "Escape") {
    event.preventDefault();
    emit("cancel");
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      window.addEventListener("keydown", onKeyDown);
      await nextTick();
      inputRef.value?.focus();
      inputRef.value?.select();
    } else {
      window.removeEventListener("keydown", onKeyDown);
    }
  },
  { immediate: true },
);

onUnmounted(() => window.removeEventListener("keydown", onKeyDown));
</script>

<template>
  <div
    v-if="open"
    class="absolute inset-0 z-50 flex min-w-0 items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
    @click.self="emit('cancel')"
  >
    <form
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-tag-dialog-title"
      class="mx-auto w-full min-w-0 max-w-sm overflow-hidden rounded-xl border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] shadow-2xl"
      @submit.prevent="emit('confirm')"
      @mousedown.stop
    >
      <div class="border-b border-[var(--oterm-border)] px-5 py-4">
        <h2 id="create-tag-dialog-title" class="text-sm font-medium text-[var(--oterm-text)]">
          Create tag
        </h2>
        <p class="mt-1 text-xs text-[var(--oterm-muted)]">At {{ targetLabel }}</p>
      </div>

      <div class="grid min-w-0 gap-4 px-5 py-4">
        <p v-if="error" class="text-xs text-[var(--oterm-danger)]">{{ error }}</p>

        <label class="grid min-w-0 gap-1.5 text-xs text-[var(--oterm-muted)]">
          Tag name
          <input
            ref="inputRef"
            :value="name"
            type="text"
            placeholder="v1.0.0"
            :class="fieldClass"
            :disabled="submitDisabled"
            @input="emit('update:name', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label class="grid min-w-0 gap-1.5 text-xs text-[var(--oterm-muted)]">
          Message
          <span class="font-normal text-[var(--oterm-faint)]">Optional — creates an annotated tag</span>
          <textarea
            :value="message"
            rows="3"
            placeholder="Release notes or tag description"
            :class="fieldClass"
            :disabled="submitDisabled"
            @input="emit('update:message', ($event.target as HTMLTextAreaElement).value)"
          />
        </label>

        <label
          v-if="hasOrigin"
          class="flex cursor-pointer select-none items-center gap-2 text-xs text-[var(--oterm-muted)]"
        >
          <input
            type="checkbox"
            :checked="pushToOrigin"
            class="rounded border-[var(--oterm-border)] bg-transparent accent-[var(--oterm-accent)]"
            :disabled="submitDisabled"
            @change="emit('update:push-to-origin', ($event.target as HTMLInputElement).checked)"
          />
          Push to origin
        </label>
      </div>

      <div class="flex justify-end gap-2 border-t border-[var(--oterm-border)] px-5 py-4">
        <button
          type="button"
          class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs text-[var(--oterm-text)] transition hover:bg-white/5"
          :disabled="submitDisabled"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="rounded-md bg-[var(--oterm-accent)]/15 px-3 py-1.5 text-xs font-medium text-[var(--oterm-accent)] transition hover:bg-[var(--oterm-accent)]/25 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="submitDisabled || !name.trim()"
        >
          {{ hasOrigin && pushToOrigin ? "Create & push" : "Create tag" }}
        </button>
      </div>
    </form>
  </div>
</template>
