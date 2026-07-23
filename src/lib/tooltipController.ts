import { ref } from "vue";

const SHOW_DELAY_MS = 450;

type TooltipVariant = "default" | "path" | "terminal-preview";

export const tooltipVisible = ref(false);
export const tooltipText = ref("");
export const tooltipVariant = ref<TooltipVariant>("default");
export const tooltipX = ref(0);
export const tooltipY = ref(0);

let showTimer: ReturnType<typeof setTimeout> | null = null;
let activeTarget: HTMLElement | null = null;
let connectionCheckInterval: ReturnType<typeof setTimeout> | null = null;

function clearShowTimer() {
  if (showTimer !== null) {
    clearTimeout(showTimer);
    showTimer = null;
  }
}

function startConnectionCheck() {
  if (connectionCheckInterval !== null) return;
  connectionCheckInterval = setInterval(() => {
    if (activeTarget && !activeTarget.isConnected) {
      hideTooltip();
    }
  }, 100);
}

function stopConnectionCheck() {
  if (connectionCheckInterval !== null) {
    clearInterval(connectionCheckInterval);
    connectionCheckInterval = null;
  }
}

function stashNativeTitle(el: HTMLElement): string | null {
  const title = el.getAttribute("title");
  if (!title?.trim()) return null;
  el.removeAttribute("title");
  el.dataset.otermTitle = title.trim();
  return title.trim();
}

function restoreNativeTitle(el: HTMLElement) {
  const text = el.dataset.otermTitle;
  if (text) {
    el.setAttribute("title", text);
    delete el.dataset.otermTitle;
  }
}

function positionForElement(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) {
    return false;
  }
  tooltipX.value = rect.left + rect.width / 2;
  tooltipY.value = rect.bottom + 6;
  return true;
}

function showTooltipForElement(el: HTMLElement, text: string) {
  if (activeTarget === el) return;
  clearShowTimer();
  activeTarget = el;
  showTimer = setTimeout(() => {
    showTimer = null;
    if (activeTarget !== el) return;
    if (!el.isConnected) {
      resetTooltipState();
      return;
    }
    const positioned = positionForElement(el);
    if (!positioned) {
      resetTooltipState();
      return;
    }
    tooltipText.value = text;
    tooltipVariant.value = readTooltipVariant(el);
    tooltipVisible.value = true;
    startConnectionCheck();
  }, SHOW_DELAY_MS);
}

function resetTooltipState() {
  tooltipVisible.value = false;
  tooltipText.value = "";
  tooltipVariant.value = "default";
  stopConnectionCheck();
}

function readTooltipVariant(el: HTMLElement): TooltipVariant {
  return el.dataset.otermTooltipVariant === "path" ? "path" : "default";
}

function hideTooltipForElement(el: HTMLElement) {
  if (activeTarget !== el) return;
  clearShowTimer();
  activeTarget = null;
  resetTooltipState();
}

export function hideTooltip() {
  clearShowTimer();
  if (activeTarget) {
    restoreNativeTitle(activeTarget);
    activeTarget = null;
  }
  resetTooltipState();
}

export function clampTooltipPosition(width: number, height: number) {
  const pad = 8;
  const half = width / 2;
  const maxX = window.innerWidth - pad - half;
  const minX = pad + half;
  tooltipX.value = Math.min(Math.max(tooltipX.value, minX), maxX);

  const maxY = window.innerHeight - pad - height;
  if (tooltipY.value > maxY) {
    tooltipY.value = maxY;
  }
}

export function findTitleTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  const el = node.closest<HTMLElement>("[title], [data-oterm-title]");
  if (!el || el.closest("[data-oterm-no-tooltip]")) return null;
  const text = (el.getAttribute("title") ?? el.dataset.otermTitle ?? "").trim();
  return text ? el : null;
}

export function activateTitleTarget(el: HTMLElement) {
  const stashed = stashNativeTitle(el);
  const text = stashed ?? el.dataset.otermTitle?.trim() ?? "";
  if (!text) return;
  showTooltipForElement(el, text);
}

export function deactivateTitleTarget(el: HTMLElement) {
  hideTooltipForElement(el);
  restoreNativeTitle(el);
}
