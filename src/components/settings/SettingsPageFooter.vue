<script setup lang="ts">
defineProps<{
  saveError?: string | null;
  saved?: boolean;
  dirty?: boolean;
  saving?: boolean;
}>();

const emit = defineEmits<{
  save: [];
}>();
</script>

<template>
  <div
    class="sticky bottom-0 -mx-1 flex items-center justify-between gap-3 border-t border-[var(--oterm-border)] bg-[var(--oterm-bg)]/95 px-1 pt-4 backdrop-blur-sm"
  >
    <p v-if="saveError" class="text-xs text-[var(--oterm-danger)]">{{ saveError }}</p>
    <p v-else-if="saved && !dirty" class="text-xs text-[var(--oterm-accent)]">Settings saved.</p>
    <p v-else-if="dirty" class="text-xs text-[var(--oterm-faint)]">Unsaved changes</p>
    <span v-else class="flex-1" />

    <button
      type="button"
      class="ml-auto rounded-md bg-[var(--oterm-accent)] px-4 py-2 text-xs font-medium text-[var(--oterm-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="saving"
      @click="emit('save')"
    >
      {{ saving ? "Saving…" : "Save" }}
    </button>
  </div>
</template>
