<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
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
  <Teleport to="body">
    <div
      v-if="open && tag"
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
          :title="tag.onOrigin ? 'Tag is already on origin' : undefined"
          @click="emit('push')"
        >
          Push to origin
        </button>
      </div>
    </div>
  </Teleport>
</template>
