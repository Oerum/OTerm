<script setup lang="ts">
defineProps<{
  open: boolean;
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[100]"
      @mousedown="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <div
        class="no-drag absolute min-w-44 rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-elevated)] py-1 shadow-xl"
        :style="{ left: `${x}px`, top: `${y}px` }"
        @mousedown.stop
        @contextmenu.stop.prevent
      >
        <slot />
      </div>
    </div>
  </Teleport>
</template>
