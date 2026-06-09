<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    label: string;
    modelValue?: string;
    placeholder?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    submitDisabled?: boolean;
  }>(),
  {
    modelValue: "",
    placeholder: "",
    confirmLabel: "Save",
    cancelLabel: "Cancel",
    submitDisabled: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  confirm: [];
  cancel: [];
}>();

const inputRef = ref<HTMLInputElement | null>(null);

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
    if (!isOpen) return;
    await nextTick();
    inputRef.value?.focus();
    inputRef.value?.select();
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
    <form
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-dialog-title"
      class="w-full max-w-sm overflow-hidden rounded-xl border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] shadow-2xl"
      @submit.prevent="emit('confirm')"
      @mousedown.stop
    >
      <div class="border-b border-[var(--oterm-border)] px-4 py-3">
        <h2 id="prompt-dialog-title" class="text-sm font-medium text-[var(--oterm-text)]">
          {{ title }}
        </h2>
      </div>
      <label class="grid gap-1.5 px-4 py-3 text-xs text-[var(--oterm-muted)]">
        {{ label }}
        <input
          ref="inputRef"
          :value="modelValue"
          type="text"
          :placeholder="placeholder"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2.5 py-1.5 text-sm text-[var(--oterm-text)] outline-none transition focus:border-[var(--oterm-accent)]/50"
          @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <div class="flex justify-end gap-2 border-t border-[var(--oterm-border)] px-4 py-3">
        <button
          type="button"
          class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs text-[var(--oterm-text)] transition hover:bg-white/5"
          @click="emit('cancel')"
        >
          {{ cancelLabel }}
        </button>
        <button
          type="submit"
          class="rounded-md bg-[var(--oterm-accent)]/15 px-3 py-1.5 text-xs font-medium text-[var(--oterm-accent)] transition hover:bg-[var(--oterm-accent)]/25 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="submitDisabled || !modelValue.trim()"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </form>
  </div>
</template>
