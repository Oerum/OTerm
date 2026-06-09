<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import sshIcon from "../assets/ssh/ssh-svgrepo-com.svg";

const emit = defineEmits<{
  openSshSftp: [];
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);

const menuItemClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--oterm-text)] transition hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none";

function toggle() {
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function onOpenSshSftp() {
  emit("openSshSftp");
  close();
}

function onDocumentMouseDown(event: MouseEvent) {
  if (!open.value) return;
  const target = event.target;
  if (target instanceof Node && rootRef.value?.contains(target)) return;
  close();
}

function onKeyDown(event: KeyboardEvent) {
  if (!open.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
}

onMounted(() => {
  document.addEventListener("mousedown", onDocumentMouseDown);
  window.addEventListener("keydown", onKeyDown);
});

onUnmounted(() => {
  document.removeEventListener("mousedown", onDocumentMouseDown);
  window.removeEventListener("keydown", onKeyDown);
});
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      type="button"
      class="flex h-6 w-6 items-center justify-center rounded-full border transition"
      :class="
        open
          ? 'border-[#42D96B]/50 bg-[var(--oterm-accent-dim)] text-[#7EF2D1]'
          : 'border-white/10 text-[var(--oterm-muted)] hover:border-white/20 hover:text-[#F5F5F7]'
      "
      title="SSH/SFTP"
      aria-label="SSH/SFTP menu"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="toggle"
    >
      <img
        :src="sshIcon"
        class="h-3.5 w-3.5 shrink-0 object-contain transition-[filter,opacity]"
        :class="open ? 'opacity-100' : 'opacity-70 grayscale'"
        alt=""
        draggable="false"
      />
    </button>

    <div
      v-if="open"
      role="menu"
      class="absolute right-0 top-full z-50 mt-1.5 min-w-[10.5rem] overflow-hidden rounded-lg border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] py-1 shadow-xl"
      @mousedown.stop
    >
      <button type="button" role="menuitem" :class="menuItemClass" @click="onOpenSshSftp">
        <img
          :src="sshIcon"
          class="h-3.5 w-3.5 shrink-0 object-contain opacity-80 grayscale"
          alt=""
          draggable="false"
        />
        SSH/SFTP
      </button>
    </div>
  </div>
</template>
