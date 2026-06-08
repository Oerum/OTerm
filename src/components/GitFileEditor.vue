<script setup lang="ts">
const model = defineModel<string>({ required: true });

defineProps<{
  loading?: boolean;
  error?: string | null;
  missing?: boolean;
}>();

const emit = defineEmits<{
  save: [];
}>();

function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === "s") {
    event.preventDefault();
    emit("save");
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-[var(--warp-bg)]">
    <div v-if="loading" class="px-3 py-4 text-sm text-[var(--warp-faint)]">Loading file…</div>
    <div v-else-if="error" class="px-3 py-4 text-sm text-[#ff7b72]">{{ error }}</div>
    <template v-else>
      <p
        v-if="missing"
        class="border-b border-[var(--warp-border)] px-3 py-1.5 text-xs text-[var(--warp-faint)]"
        style="font-family: var(--warp-font-ui)"
      >
        File is missing on disk — saving will create it.
      </p>
      <textarea
        v-model="model"
        class="warp-scroll min-h-0 flex-1 resize-none border-0 bg-transparent p-2 text-xs leading-relaxed text-[var(--warp-text)] outline-none"
        style="font-family: var(--warp-font-mono)"
        spellcheck="false"
        @keydown="onKeydown"
      />
    </template>
  </div>
</template>
