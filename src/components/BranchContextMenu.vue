<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import type { BranchRefInfo } from "../types/branchManager";

const props = defineProps<{
  open: boolean;
  x: number;
  y: number;
  branch: BranchRefInfo | null;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  copyName: [];
  switch: [];
  pull: [];
  push: [];
  fetch: [];
  createFrom: [];
  merge: [];
  delete: [];
}>();

const canSwitch = computed(() => !!props.branch && !props.branch.isCurrent);
const canDelete = computed(() => !!props.branch && !props.branch.isCurrent);
const isLocal = computed(() => !!props.branch && !props.branch.isRemote);

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
      v-if="open && branch"
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
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-text)]']"
          :disabled="busy || !canSwitch"
          @click="emit('switch')"
        >
          Switch
        </button>
        <button
          v-if="isLocal"
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-text)]']"
          :disabled="busy"
          @click="emit('pull')"
        >
          Pull
        </button>
        <button
          v-if="isLocal"
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-text)]']"
          :disabled="busy"
          @click="emit('push')"
        >
          Push
        </button>
        <button
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-text)]']"
          :disabled="busy"
          @click="emit('fetch')"
        >
          Fetch
        </button>
        <div class="my-1 border-t border-[var(--oterm-border)]/60" />
        <button
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-text)]']"
          :disabled="busy"
          @click="emit('createFrom')"
        >
          Create branch from…
        </button>
        <button
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-text)]']"
          :disabled="busy"
          @click="emit('merge')"
        >
          Merge into…
        </button>
        <button
          type="button"
          :class="[menuItemClass, 'text-[var(--oterm-danger)]']"
          :disabled="busy || !canDelete"
          @click="emit('delete')"
        >
          Delete
        </button>
      </div>
    </div>
  </Teleport>
</template>
