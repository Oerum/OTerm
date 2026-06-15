<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  activateTitleTarget,
  clampTooltipPosition,
  deactivateTitleTarget,
  findTitleTarget,
  hideTooltip,
  tooltipText,
  tooltipVariant,
  tooltipVisible,
  tooltipX,
  tooltipY,
} from "../lib/tooltipController";

const tooltipRef = ref<HTMLElement | null>(null);

function onPointerOver(event: PointerEvent) {
  if (event.pointerType === "touch") return;
  const target = findTitleTarget(event.target);
  if (!target) return;
  activateTitleTarget(target);
}

function onPointerOut(event: PointerEvent) {
  const target = findTitleTarget(event.target);
  if (!target) return;
  const related = event.relatedTarget;
  if (related instanceof Node && target.contains(related)) return;
  deactivateTitleTarget(target);
}

function onScroll() {
  hideTooltip();
}

function onPointerDown() {
  hideTooltip();
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") hideTooltip();
}

watch(tooltipVisible, (visible) => {
  if (!visible) return;
  nextTick(() => {
    const el = tooltipRef.value;
    if (!el) return;
    clampTooltipPosition(el.offsetWidth, el.offsetHeight);
  });
});

onMounted(() => {
  document.addEventListener("pointerover", onPointerOver, true);
  document.addEventListener("pointerout", onPointerOut, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("scroll", onScroll, true);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("blur", hideTooltip);
});

onUnmounted(() => {
  document.removeEventListener("pointerover", onPointerOver, true);
  document.removeEventListener("pointerout", onPointerOut, true);
  document.removeEventListener("pointerdown", onPointerDown, true);
  document.removeEventListener("scroll", onScroll, true);
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("blur", hideTooltip);
  hideTooltip();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="oterm-tooltip">
      <div
        v-if="tooltipVisible && tooltipText"
        ref="tooltipRef"
        role="tooltip"
        class="oterm-tooltip pointer-events-none fixed z-[10000] -translate-x-1/2 rounded-md border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] px-2.5 py-1 text-[11px] leading-snug text-[var(--oterm-text)] shadow-xl"
        :class="
          tooltipVariant === 'path'
            ? 'max-w-[min(42rem,calc(100vw-1rem))] font-mono break-all'
            : 'max-w-[min(16rem,calc(100vw-1rem))]'
        "
        :style="{ left: `${tooltipX}px`, top: `${tooltipY}px` }"
      >
        {{ tooltipText }}
      </div>
    </Transition>
  </Teleport>
</template>
