<script setup lang="ts">
import { computed } from "vue";

const model = defineModel<number>({ required: true });

const props = withDefaults(
  defineProps<{
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
  }>(),
  {
    min: 1,
    max: 50,
    step: 1,
    disabled: false,
  },
);

const atMin = computed(() => model.value <= props.min);
const atMax = computed(() => model.value >= props.max);

function clamp(value: number) {
  return Math.min(props.max, Math.max(props.min, Math.round(value)));
}

function decrement() {
  if (props.disabled || atMin.value) return;
  model.value = clamp(model.value - props.step);
}

function increment() {
  if (props.disabled || atMax.value) return;
  model.value = clamp(model.value + props.step);
}

function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value.replace(/\D/g, "");
  if (!raw) return;
  model.value = clamp(Number(raw));
}
</script>

<template>
  <div
    class="inline-flex h-10 overflow-hidden rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
    :class="disabled ? 'opacity-50' : ''"
  >
    <button
      type="button"
      class="flex w-9 shrink-0 items-center justify-center border-r border-[var(--oterm-border)] text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)] disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="disabled || atMin"
      aria-label="Decrease"
      @click="decrement"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M2 5h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </button>
    <input
      :value="model"
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      class="min-w-[3rem] border-0 bg-transparent px-2 text-center text-sm tabular-nums text-[var(--oterm-text)] outline-none"
      :disabled="disabled"
      @change="onInput"
    />
    <button
      type="button"
      class="flex w-9 shrink-0 items-center justify-center border-l border-[var(--oterm-border)] text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)] disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="disabled || atMax"
      aria-label="Increase"
      @click="increment"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M5 2v6M2 5h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>
