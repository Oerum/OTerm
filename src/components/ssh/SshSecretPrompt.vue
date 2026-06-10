<script setup lang="ts">
defineProps<{
  title: string;
  label: string;
  modelValue: string;
  savePassword?: boolean;
  showSavePassword?: boolean;
  saveCheckboxLabel?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:savePassword": [value: boolean];
  submit: [];
  cancel: [];
}>();
</script>

<template>
  <div
    class="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
    @click.self="emit('cancel')"
  >
    <form
      class="w-full max-w-sm rounded-xl border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] p-4 shadow-2xl"
      @submit.prevent="emit('submit')"
    >
      <h3 class="text-sm font-medium">{{ title }}</h3>
      <label class="mt-3 grid gap-1 text-xs text-[var(--oterm-muted)]">
        {{ label }}
        <input
          :value="modelValue"
          type="password"
          autofocus
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
          @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label
        v-if="showSavePassword"
        class="mt-3 flex items-center gap-2 text-xs text-[var(--oterm-muted)]"
      >
        <input
          type="checkbox"
          :checked="savePassword"
          @change="emit('update:savePassword', ($event.target as HTMLInputElement).checked)"
        />
        {{ saveCheckboxLabel ?? "Save password in OS credential store" }}
      </label>
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs hover:bg-white/5"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="rounded-md border border-[var(--oterm-accent)]/40 px-3 py-1.5 text-xs text-[var(--oterm-accent)] hover:bg-[var(--oterm-accent)]/10"
        >
          Continue
        </button>
      </div>
    </form>
  </div>
</template>
