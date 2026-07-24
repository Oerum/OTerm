<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import ContextMenuWrapper from "./ContextMenuWrapper.vue";
import type { TagRefInfo } from "../types/branchManager";

const props = defineProps<{
  open: boolean;
  x: number;
  y: number;
  tag: TagRefInfo | null;
  hasOrigin?: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  copyName: [];
  push: [];
}>();

const canPush = computed(
  () => !!props.tag && !!props.hasOrigin && !props.tag.onOrigin,
);

const menuItemClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40";

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    emit("close");
  }
}

onMounted(() => window.addEventListener("keydown", onKeyDown));
onUnmounted(() => window.removeEventListener("keydown", onKeyDown));
</script>

<template>
  <ContextMenuWrapper :open="open && Boolean(tag)" :x="x" :y="y" @close="emit('close')">
    <button
      type="button"
      :class="[menuItemClass, 'text-[var(--oterm-text)]']"
      @click="emit('copyName')"
    >
      Copy name
    </button>
    <button
      v-if="hasOrigin"
      type="button"
      :class="[menuItemClass, 'text-[var(--oterm-text)]']"
      :disabled="busy || !canPush"
      :title="tag?.onOrigin ? 'Tag is already on origin' : undefined"
      @click="emit('push')"
    >
      Push to origin
    </button>
  </ContextMenuWrapper>
</template>
