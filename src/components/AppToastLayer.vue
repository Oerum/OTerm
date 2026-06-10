<script setup lang="ts">
import {
  appToastActivity,
  appToasts,
  dismissAppToast,
  type AppToastVariant,
} from "../lib/appToast";

const variantClass: Record<AppToastVariant, string> = {
  info: "border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] text-[var(--oterm-text)]",
  success: "border-[#42D96B]/40 bg-[#42D96B]/10 text-[#B8F5D4]",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  error: "border-red-500/40 bg-red-500/10 text-red-100",
};

const dismissHoverClass: Record<AppToastVariant, string> = {
  info: "hover:bg-white/10",
  success: "hover:bg-[#42D96B]/20",
  warning: "hover:bg-amber-500/20",
  error: "hover:bg-red-500/25",
};

const variantLabel: Record<AppToastVariant, string> = {
  info: "Info",
  success: "Success",
  warning: "Warning",
  error: "Error",
};

const progressBarClass: Record<AppToastVariant, string> = {
  info: "bg-[var(--oterm-accent)]",
  success: "bg-[var(--oterm-accent)]",
  warning: "bg-amber-400/80",
  error: "bg-red-400/80",
};

function onDismiss(id: number) {
  dismissAppToast(id);
}
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed right-3 top-11 z-[10000] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2"
      aria-live="polite"
      aria-relevant="additions"
    >
      <Transition name="app-toast">
        <div
          v-if="appToastActivity"
          role="status"
          aria-live="polite"
          class="app-toast-item pointer-events-none flex items-center gap-2 overflow-hidden rounded-lg border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] py-2 pl-3 pr-3 text-xs text-[var(--oterm-text)] shadow-lg backdrop-blur-sm"
          style="font-family: var(--oterm-font-ui)"
        >
          <span
            class="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[var(--oterm-accent)] border-r-transparent"
            aria-hidden="true"
          />
          {{ appToastActivity }}
        </div>
      </Transition>

      <TransitionGroup tag="div" name="app-toast" class="relative flex flex-col gap-2">
        <div
          v-for="toast in appToasts"
          :key="toast.id"
          role="status"
          class="app-toast-item pointer-events-auto flex flex-col overflow-hidden rounded-lg border shadow-lg backdrop-blur-sm"
          :class="variantClass[toast.variant]"
        >
          <div class="flex min-w-0">
            <p
              class="min-w-0 flex-1 py-2 pl-3 pr-2 text-xs leading-relaxed"
              style="font-family: var(--oterm-font-ui)"
            >
              <span class="sr-only">{{ variantLabel[toast.variant] }}: </span>
              {{ toast.message }}
            </p>
            <button
              type="button"
              class="flex w-8 shrink-0 items-center justify-center self-stretch border-l border-white/10 text-current opacity-80 transition hover:opacity-100"
              :class="dismissHoverClass[toast.variant]"
              aria-label="Dismiss notification"
              @click.stop="onDismiss(toast.id)"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5" stroke-width="1.3" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <div
            class="h-0.5 w-full bg-black/15"
            aria-hidden="true"
          >
            <div
              class="app-toast-progress h-full w-full origin-left"
              :class="progressBarClass[toast.variant]"
              :style="{ animationDuration: `${toast.durationMs}ms` }"
            />
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.app-toast-enter-active,
.app-toast-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.app-toast-leave-active {
  position: absolute;
  right: 0;
  width: 100%;
}

.app-toast-enter-from,
.app-toast-leave-to {
  opacity: 0;
  transform: translateX(0.75rem);
}

.app-toast-move {
  transition: transform 0.18s ease;
}

.app-toast-progress {
  animation: app-toast-progress-shrink linear forwards;
}

@keyframes app-toast-progress-shrink {
  from {
    transform: scaleX(1);
  }

  to {
    transform: scaleX(0);
  }
}
</style>
