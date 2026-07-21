<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import dockerIcon from "../assets/docker/docker-mark-ocean-blue.svg";
import sshIcon from "../assets/ssh/ssh-svgrepo-com.svg";

defineProps<{
  canOpenGitFeatures?: boolean;
}>();

const emit = defineEmits<{
  openSshSftp: [];
  openProcessManager: [];
  openDockerManager: [];
  openPullRequests: [];
  openIssues: [];
  openBranchManager: [];
  toggleTools: [];
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);

const menuItemClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--oterm-text)] transition hover:bg-white/5";

const iconClass = "h-3.5 w-3.5 shrink-0 opacity-80";

function close() {
  open.value = false;
}

function toggle() {
  open.value = !open.value;
}

function run(action: () => void) {
  close();
  action();
}

function onDocPointerDown(event: PointerEvent) {
  const target = event.target as Node | null;
  if (rootRef.value && target && !rootRef.value.contains(target)) {
    close();
  }
}

watch(open, (next) => {
  if (next) {
    document.addEventListener("pointerdown", onDocPointerDown, true);
  } else {
    document.removeEventListener("pointerdown", onDocPointerDown, true);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointerDown, true);
});
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      type="button"
      class="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-[var(--oterm-muted)] transition hover:border-white/20 hover:bg-white/5 hover:text-[#F5F5F7]"
      title="Tools"
      aria-label="Tools"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <circle cx="3.5" cy="8" r="1.4" />
        <circle cx="8" cy="8" r="1.4" />
        <circle cx="12.5" cy="8" r="1.4" />
      </svg>
    </button>
    <div
      v-if="open"
      class="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-elevated)] py-1 shadow-lg"
      role="menu"
    >
      <button
        type="button"
        :class="menuItemClass"
        role="menuitem"
        @click="run(() => emit('toggleTools'))"
      >
        <svg :class="iconClass" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
          <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" stroke-width="1.4" />
          <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" stroke-width="1.4" />
          <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" stroke-width="1.4" />
          <rect x="9" y="9" width="4.5" height="4.5" rx="1" stroke-width="1.4" />
        </svg>
        File browser
      </button>
      <button
        type="button"
        :class="menuItemClass"
        role="menuitem"
        @click="run(() => emit('openSshSftp'))"
      >
        <img
          :src="sshIcon"
          class="h-3.5 w-3.5 shrink-0 object-contain opacity-80 grayscale"
          alt=""
          draggable="false"
        />
        SSH / SFTP
      </button>
      <button
        type="button"
        :class="menuItemClass"
        role="menuitem"
        @click="run(() => emit('openProcessManager'))"
      >
        <svg :class="iconClass" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M2.5 3.5h11M2.5 8h11M2.5 12.5h7" stroke-width="1.4" stroke-linecap="round" />
        </svg>
        Processes
      </button>
      <button
        type="button"
        :class="menuItemClass"
        role="menuitem"
        @click="run(() => emit('openDockerManager'))"
      >
        <img
          :src="dockerIcon"
          class="h-3.5 w-3.5 shrink-0 object-contain"
          alt=""
          draggable="false"
        />
        Docker
      </button>
      <template v-if="canOpenGitFeatures">
        <div class="my-1 border-t border-[var(--oterm-border)]" />
        <button
          type="button"
          :class="menuItemClass"
          role="menuitem"
          @click="run(() => emit('openPullRequests'))"
        >
          <svg :class="iconClass" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path
              d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"
            />
          </svg>
          Pull Requests
        </button>
        <button
          type="button"
          :class="menuItemClass"
          role="menuitem"
          @click="run(() => emit('openIssues'))"
        >
          <svg :class="iconClass" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
          </svg>
          Issues
        </button>
        <button
          type="button"
          :class="menuItemClass"
          role="menuitem"
          @click="run(() => emit('openBranchManager'))"
        >
          <svg :class="iconClass" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path
              d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"
            />
          </svg>
          Branches
        </button>
      </template>
    </div>
  </div>
</template>
