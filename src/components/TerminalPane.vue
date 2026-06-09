<script setup lang="ts">
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { TERMINAL_FONT_FAMILY, TERMINAL_FONT_SIZE } from "../lib/terminalFont";
import {
  detectCliAgent,
  isAgentExitCommand,
  type CliAgentId,
} from "../lib/terminalAgentMode";
import {
  agentLaunchPromptClearSuppressUntil,
  applyAgentExitHandshakeFromOutput,
} from "../lib/terminalAgentExitHandshake";
import { fetchTerminalAutocompleteSuggestion } from "../lib/terminalAutocompleteApi";
import {
  useTerminalAutocompleteSettings,
} from "../lib/terminalAutocompleteSettings";
import {
  applyTerminalInputDraft,
  isRecordableCommand,
  normalizeSubmittedCommand,
} from "../lib/terminalInputDraft";
import { resolveTerminalDraftInput } from "../lib/terminalCurrentInput";
import { appendPromptScanBuffer, looksLikeTuiTransition } from "../lib/terminalPrompt";
import {
  findTerminalLinkAtMouseEvent,
  isHttpUrl,
  pathMatchToLinkRange,
  scanLineForTerminalLinks,
} from "../lib/terminalPaths";
import {
  getCtrlDEofPayload,
  getMultilineEnterPayload,
  resolveCtrlDTerminalPayload,
  shouldForwardPtyKeyOverride,
} from "../lib/terminalMultilineEnter";
import {
  killTerminal,
  resizeTerminal,
  spawnTerminal,
  writeTerminal,
} from "../lib/terminalApi";
import type { TerminalExitEvent, TerminalOutputEvent } from "../types/terminal";
import {
  isTerminalAutocompleteConfigured,
  type TerminalCommandExchange,
} from "../types/terminalAutocomplete";
import "@xterm/xterm/css/xterm.css";
import TerminalPathContextMenu from "./TerminalPathContextMenu.vue";
import type { IDisposable } from "@xterm/xterm";

const { settings: autocompleteSettings } = useTerminalAutocompleteSettings();

const props = defineProps<{
  paneId: string;
  sessionId: string | null;
  shellId: string;
  initialCwd: string;
  active: boolean;
  activeAgentId?: CliAgentId | null;
}>();

const emit = defineEmits<{
  sessionCreated: [paneId: string, sessionId: string];
  sessionEnded: [paneId: string];
  cwdChanged: [paneId: string, cwd: string];
  promptReady: [paneId: string];
  commandSubmitted: [command: string];
  agentModeChanged: [paneId: string, agentId: CliAgentId | null];
  oscTitleChanged: [paneId: string, title: string | null];
  focusPane: [];
}>();

const containerRef = ref<HTMLElement | null>(null);
const paneRootRef = ref<HTMLElement | null>(null);
const localSessionId = ref<string | null>(props.sessionId);
const pendingInput = ref("");
const draftInput = ref("");
const exchanges = ref<TerminalCommandExchange[]>([]);
const suggestion = ref<string | null>(null);
const suggestionLoading = ref(false);
const paneCwd = ref("");
const activeAgentId = ref<CliAgentId | null>(null);
const agentExitConfirmPending = ref(false);
const promptClearSuppressUntil = ref(0);
const tuiModeActive = ref(false);
const pathMenuOpen = ref(false);
const pathMenuX = ref(0);
const pathMenuY = ref(0);
const pathMenuPath = ref<string | null>(null);
const pathMenuIsUrl = ref(false);
const pathCopiedVisible = ref(false);

function setActiveAgent(agentId: CliAgentId | null, emitChange = true) {
  if (activeAgentId.value === agentId) return;
  activeAgentId.value = agentId;
  if (emitChange) emit("agentModeChanged", props.paneId, agentId);
}

watch(
  () => props.activeAgentId,
  (agentId) => {
    setActiveAgent(agentId ?? null, false);
    schedulePathDecorations();
  },
);

watch(activeAgentId, () => {
  schedulePathDecorations();
});

let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;
let unlistenOutput: UnlistenFn | null = null;
let unlistenExit: UnlistenFn | null = null;
let resizeTimer: number | undefined;
let suggestionTimer: number | undefined;
let suggestionRequestId = 0;
let capturingResponse = false;
let lastSubmittedCommand = "";
let responseBuffer = "";
let promptScanBuffer = "";
let linkProviderDisposable: IDisposable | null = null;
let pathDecorationDisposables: IDisposable[] = [];
let pathRefreshDisposables: IDisposable[] = [];
let pathDecorationTimer: number | undefined;
let pathCopiedTimer: number | undefined;
let terminalContextMenuHandler: ((event: MouseEvent) => void) | null = null;

function pathsInteractiveEnabled(): boolean {
  return !activeAgentId.value && !tuiModeActive.value;
}

function closePathMenu() {
  pathMenuOpen.value = false;
  pathMenuPath.value = null;
  pathMenuIsUrl.value = false;
}

function showPathCopiedToast() {
  pathCopiedVisible.value = true;
  window.clearTimeout(pathCopiedTimer);
  pathCopiedTimer = window.setTimeout(() => {
    pathCopiedVisible.value = false;
  }, 1600);
}

async function copyPathFromMenu() {
  const path = pathMenuPath.value;
  if (!path) return;
  try {
    await navigator.clipboard.writeText(path);
    showPathCopiedToast();
  } catch {
    // Clipboard may be unavailable.
  }
  closePathMenu();
}

async function appendPathFromMenu() {
  const path = pathMenuPath.value;
  if (!path) return;
  await appendToPrompt(path);
  closePathMenu();
}

async function openUrlFromMenu() {
  const url = pathMenuPath.value;
  if (!url || !isHttpUrl(url)) return;
  try {
    await openUrl(url);
  } catch {
    // Opener may be unavailable.
  }
  closePathMenu();
}

async function appendToPrompt(text: string) {
  if (!localSessionId.value || !text || !pathsInteractiveEnabled()) return;
  const draft = getActiveDraft();
  const prefix = draft.length > 0 && !draft.endsWith(" ") ? " " : "";
  const payload = prefix + text;
  await writeTerminal(localSessionId.value, payload);
  draftInput.value = draft + payload;
  clearSuggestion();
  terminal?.focus();
}

function getTerminalCellHeight(): number {
  if (!terminal) return 17;
  const core = (terminal as unknown as {
    _core?: { _renderService?: { dimensions?: { css?: { cell?: { height?: number } } } } };
  })._core;
  return core?._renderService?.dimensions?.css?.cell?.height ?? 17;
}

function clearPathDecorations() {
  for (const disposable of pathDecorationDisposables) {
    disposable.dispose();
  }
  pathDecorationDisposables = [];
}

function refreshPathDecorations() {
  if (!terminal || !pathsInteractiveEnabled()) {
    clearPathDecorations();
    return;
  }

  clearPathDecorations();
  const buffer = terminal.buffer.active;
  const cursorLine = buffer.baseY + buffer.cursorY;
  const viewportStart = Math.max(0, buffer.viewportY - 1);
  const viewportEnd = Math.min(buffer.length - 1, buffer.viewportY + terminal.rows + 1);
  const cellHeight = getTerminalCellHeight();

  for (let lineIndex = viewportStart; lineIndex <= viewportEnd; lineIndex++) {
    const line = buffer.getLine(lineIndex);
    if (!line) continue;
    const text = line.translateToString(false);
    const paths = scanLineForTerminalLinks(text);
    if (paths.length === 0) continue;

    for (const path of paths) {
      const marker = terminal.registerMarker(lineIndex - cursorLine);
      if (!marker || marker.isDisposed) continue;

      const decoration = terminal.registerDecoration({
        marker,
        x: path.start,
        width: Math.max(path.end - path.start, 1),
        height: 1,
        layer: "top",
        backgroundColor: "rgba(0,0,0,0.01)",
      });
      if (!decoration) {
        marker.dispose();
        continue;
      }

      const renderDisposable = decoration.onRender((element) => {
        element.classList.add("terminal-path-underline");
        element.style.pointerEvents = "none";
        element.style.height = "2px";
        element.style.marginTop = `${cellHeight - 2}px`;
        element.style.background = "rgba(0, 212, 170, 0.75)";
        element.style.border = "none";
      });

      pathDecorationDisposables.push({
        dispose: () => {
          renderDisposable.dispose();
          decoration.dispose();
          marker.dispose();
        },
      });
    }
  }
}

function schedulePathDecorations() {
  window.clearTimeout(pathDecorationTimer);
  pathDecorationTimer = window.setTimeout(() => {
    refreshPathDecorations();
  }, 120);
}

function registerPathLinkProvider() {
  if (!terminal) return;
  linkProviderDisposable?.dispose();
  linkProviderDisposable = terminal.registerLinkProvider({
    provideLinks(bufferLineNumber, callback) {
      if (!pathsInteractiveEnabled()) {
        callback(undefined);
        return;
      }
      const line = terminal?.buffer.active.getLine(bufferLineNumber - 1);
      if (!line) {
        callback(undefined);
        return;
      }
      const text = line.translateToString(false);
      const paths = scanLineForTerminalLinks(text);
      callback(
        paths.map((path) => ({
          text: path.text,
          range: pathMatchToLinkRange(path, bufferLineNumber),
          decorations: { underline: true, pointerCursor: true },
          activate(event, linkText) {
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault();
              void appendToPrompt(linkText);
            }
          },
        })),
      );
    },
  });
}

function onTerminalContextMenu(event: MouseEvent) {
  if (!terminal || !pathsInteractiveEnabled()) return;
  const hit = findTerminalLinkAtMouseEvent(terminal, event);
  if (!hit) return;
  event.preventDefault();
  pathMenuX.value = event.clientX;
  pathMenuY.value = event.clientY;
  pathMenuPath.value = hit.text;
  pathMenuIsUrl.value = isHttpUrl(hit.text);
  pathMenuOpen.value = true;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\r/g, "");
}

function trimExchanges() {
  const max = autocompleteSettings.value.commandContextCount;
  if (exchanges.value.length > max) {
    exchanges.value = exchanges.value.slice(-max);
  }
}

function finalizeExchange() {
  if (!lastSubmittedCommand) return;
  exchanges.value.push({
    command: lastSubmittedCommand,
    response: stripAnsi(responseBuffer).trim(),
  });
  trimExchanges();
  capturingResponse = false;
  lastSubmittedCommand = "";
  responseBuffer = "";
}

function clearSuggestion() {
  suggestion.value = null;
  suggestionLoading.value = false;
}

function getActiveDraft(): string {
  return resolveTerminalDraftInput(terminal, draftInput.value);
}

function canSuggest(): boolean {
  const cfg = autocompleteSettings.value;
  return (
    props.active &&
    cfg.enabled &&
    isTerminalAutocompleteConfigured(cfg) &&
    !activeAgentId.value
  );
}

function scheduleSuggestion() {
  window.clearTimeout(suggestionTimer);
  if (!canSuggest()) {
    clearSuggestion();
    return;
  }

  if (getActiveDraft().trim().length < 2) {
    clearSuggestion();
    return;
  }

  suggestionTimer = window.setTimeout(() => {
    const draft = getActiveDraft().trim();
    if (draft.length < 2) {
      clearSuggestion();
      return;
    }
    void requestSuggestion(draft);
  }, 650);
}

async function requestSuggestion(draft: string) {
  if (!canSuggest()) return;
  const requestId = ++suggestionRequestId;
  suggestionLoading.value = true;
  try {
    const result = await fetchTerminalAutocompleteSuggestion(
      autocompleteSettings.value,
      exchanges.value.slice(-autocompleteSettings.value.commandContextCount),
      draft,
      paneCwd.value,
    );
    if (requestId !== suggestionRequestId || draft !== getActiveDraft().trim()) return;
    suggestion.value = result;
  } catch {
    if (requestId === suggestionRequestId) suggestion.value = null;
  } finally {
    if (requestId === suggestionRequestId) suggestionLoading.value = false;
  }
}

async function acceptSuggestion() {
  const line = suggestion.value;
  if (!line || !localSessionId.value) return;
  const draft = getActiveDraft();
  const toWrite = line.startsWith(draft) ? line.slice(draft.length) : line;
  if (!toWrite) return;
  await writeTerminal(localSessionId.value, toWrite);
  draftInput.value = line.startsWith(draft) ? line : draft + toWrite;
  clearSuggestion();
}

async function clearInitialScreen(sessionId: string) {
  if (!terminal) return;
  terminal.clear();
  terminal.reset();

  if (props.shellId === "cmd") {
    await writeTerminal(sessionId, "cls\r");
    return;
  }

  if (props.shellId === "pwsh" || props.shellId === "powershell") {
    await writeTerminal(sessionId, "Clear-Host\r");
    return;
  }

  await writeTerminal(sessionId, "\x1b[2J\x1b[3J\x1b[H");
}

async function ensureSession() {
  if (localSessionId.value || !terminal || !fitAddon) return;
  fitAddon.fit();
  const cwd =
    props.initialCwd && props.initialCwd !== "~" ? props.initialCwd : undefined;
  const sessionId = await spawnTerminal(
    props.shellId,
    terminal.cols,
    terminal.rows,
    cwd,
  );
  localSessionId.value = sessionId;
  emit("sessionCreated", props.paneId, sessionId);
  await clearInitialScreen(sessionId);
}

function trackCwd(data: string) {
  if (looksLikeTuiTransition(data)) {
    tuiModeActive.value = true;
    clearPathDecorations();
  }

  const scan = appendPromptScanBuffer(promptScanBuffer, data);
  promptScanBuffer = scan.buffer;

  const next = applyAgentExitHandshakeFromOutput(
    data,
    {
      activeAgentId: activeAgentId.value,
      agentExitConfirmPending: agentExitConfirmPending.value,
      promptClearSuppressUntil: promptClearSuppressUntil.value,
    },
    scan.trailingPrompt,
  );

  if (next.activeAgentId !== activeAgentId.value) {
    setActiveAgent(next.activeAgentId);
  }
  agentExitConfirmPending.value = next.agentExitConfirmPending;

  if (!next.trailingPrompt) return;

  tuiModeActive.value = false;
  paneCwd.value = next.trailingPrompt.cwd;
  finalizeExchange();
  promptScanBuffer = "";
  emit("cwdChanged", props.paneId, next.trailingPrompt.cwd);
  emit("promptReady", props.paneId);
  scheduleSuggestion();
}

function maybeRecordCommand(data: string, preferredLine = "") {
  pendingInput.value += data;
  if (!pendingInput.value.includes("\r") && !pendingInput.value.includes("\n")) {
    return;
  }

  finalizeExchange();

  const fromPending = normalizeSubmittedCommand(pendingInput.value);
  pendingInput.value = "";
  const command = normalizeSubmittedCommand(preferredLine) || fromPending;
  if (!isRecordableCommand(command)) {
    return;
  }

  const agentId = detectCliAgent(command);
  if (agentId) {
    setActiveAgent(agentId);
    agentExitConfirmPending.value = false;
    promptClearSuppressUntil.value = agentLaunchPromptClearSuppressUntil();
  }
  if (isAgentExitCommand(command)) {
    setActiveAgent(null);
    agentExitConfirmPending.value = false;
    promptClearSuppressUntil.value = 0;
  }

  lastSubmittedCommand = command;
  capturingResponse = true;
  responseBuffer = "";
  clearSuggestion();
  emit("commandSubmitted", command);
}

async function forwardTerminalInput(data: string) {
  const isEnter = /[\r\n]/.test(data);
  const commandLine = isEnter ? getActiveDraft() : "";

  draftInput.value = applyTerminalInputDraft(draftInput.value, data);
  if (lastSubmittedCommand && draftInput.value.trim().length > 0) {
    finalizeExchange();
    promptScanBuffer = "";
  }
  maybeRecordCommand(data, commandLine);
  scheduleSuggestion();
  if (!localSessionId.value) {
    await ensureSession();
  }
  if (localSessionId.value) {
    await writeTerminal(localSessionId.value, data);
  }
}

function onWindowKeyCapture(event: KeyboardEvent) {
  if (!shouldForwardPtyKeyOverride(event, props.active, paneRootRef.value)) return;

  const multilinePayload = getMultilineEnterPayload(event);
  const ctrlDPayload = getCtrlDEofPayload(event)
    ? resolveCtrlDTerminalPayload(agentExitConfirmPending.value)
    : null;
  const ptyPayload = ctrlDPayload ?? multilinePayload;
  if (!ptyPayload) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (ctrlDPayload) {
    agentExitConfirmPending.value = false;
  }
  void forwardTerminalInput(ptyPayload);
  terminal?.focus();
}

async function handleResize() {
  if (!terminal || !fitAddon || !localSessionId.value) return;
  fitAddon.fit();
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(async () => {
    if (!terminal || !localSessionId.value) return;
    await resizeTerminal(localSessionId.value, terminal.cols, terminal.rows);
  }, 100);
}

async function mountTerminal() {
  if (!containerRef.value) return;

  terminal = new Terminal({
    cursorBlink: true,
    fontFamily: TERMINAL_FONT_FAMILY,
    fontSize: TERMINAL_FONT_SIZE,
    fontWeight: "400",
    fontWeightBold: "600",
    lineHeight: 1.45,
    letterSpacing: 0,
    scrollback: 5000,
    rescaleOverlappingGlyphs: true,
    theme: {
      background: "#0a0a0a",
      foreground: "#ececec",
      cursor: "#00d4aa",
      cursorAccent: "#0a0a0a",
      selectionBackground: "rgba(0, 212, 170, 0.22)",
      black: "#0a0a0a",
      red: "#ff5f57",
      green: "#00d4aa",
      yellow: "#febc2e",
      blue: "#79a8ff",
      magenta: "#c792ea",
      cyan: "#56d4dd",
      white: "#ececec",
      brightBlack: "#5c5c5c",
      brightRed: "#ff7b72",
      brightGreen: "#00d4aa",
      brightYellow: "#ffd866",
      brightBlue: "#82aaff",
      brightMagenta: "#d4a5ff",
      brightCyan: "#56d4dd",
      brightWhite: "#ffffff",
    },
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(containerRef.value);
  fitAddon.fit();
  terminal.focus();
  registerPathLinkProvider();
  pathRefreshDisposables.push(
    terminal.onWriteParsed(() => schedulePathDecorations()),
    terminal.onScroll(() => schedulePathDecorations()),
  );
  if (terminal.element) {
    terminalContextMenuHandler = onTerminalContextMenu;
    terminal.element.addEventListener("contextmenu", terminalContextMenuHandler);
  }

  terminal.onTitleChange((title) => {
    const normalized = title.trim() || null;
    emit("oscTitleChanged", props.paneId, normalized);
  });

  terminal.attachCustomKeyEventHandler((event) => {
    if (!suggestion.value) return true;
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      void acceptSuggestion();
      return false;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      clearSuggestion();
      return false;
    }
    return true;
  });

  terminal.onData(async (data) => {
    await forwardTerminalInput(data);
  });

  unlistenOutput = await listen<TerminalOutputEvent>("terminal-output", (event) => {
    if (event.payload.sessionId !== localSessionId.value || !terminal) return;
    if (capturingResponse) responseBuffer += event.payload.data;
    terminal.write(event.payload.data);
    trackCwd(event.payload.data);
    schedulePathDecorations();
  });

  unlistenExit = await listen<TerminalExitEvent>("terminal-exit", (event) => {
    if (event.payload.sessionId !== localSessionId.value || !terminal) return;
    setActiveAgent(null);
    agentExitConfirmPending.value = false;
    promptClearSuppressUntil.value = 0;
    tuiModeActive.value = false;
    clearPathDecorations();
    terminal.writeln("\r\n[session ended]");
    localSessionId.value = null;
    emit("oscTitleChanged", props.paneId, null);
    emit("sessionEnded", props.paneId);
  });

  resizeObserver = new ResizeObserver(() => {
    void handleResize();
  });
  resizeObserver.observe(containerRef.value);

  await ensureSession();
}

async function disposeSession() {
  if (!localSessionId.value) return;
  const sessionId = localSessionId.value;
  localSessionId.value = null;
  try {
    await killTerminal(sessionId);
  } catch {
    // Session may already be gone.
  }
  emit("oscTitleChanged", props.paneId, null);
  emit("sessionEnded", props.paneId);
}

function focusTerminal() {
  terminal?.focus();
}

defineExpose({
  focusTerminal,
});

onMounted(async () => {
  localSessionId.value = props.sessionId;
  await nextTick();
  window.addEventListener("keydown", onWindowKeyCapture, true);
  await mountTerminal();
});

watch(
  () => props.active,
  (active) => {
    if (active) {
      terminal?.focus();
      void handleResize();
      scheduleSuggestion();
    } else {
      clearSuggestion();
    }
  },
);

watch(
  () => autocompleteSettings.value,
  () => scheduleSuggestion(),
  { deep: true },
);

watch(
  () => props.shellId,
  async (shellId, previous) => {
    if (shellId === previous || !terminal) return;
    await disposeSession();
    await ensureSession();
  },
);

onBeforeUnmount(async () => {
  window.removeEventListener("keydown", onWindowKeyCapture, true);
  window.clearTimeout(resizeTimer);
  window.clearTimeout(suggestionTimer);
  window.clearTimeout(pathDecorationTimer);
  window.clearTimeout(pathCopiedTimer);
  suggestionRequestId += 1;
  linkProviderDisposable?.dispose();
  linkProviderDisposable = null;
  for (const disposable of pathRefreshDisposables) {
    disposable.dispose();
  }
  pathRefreshDisposables = [];
  clearPathDecorations();
  if (terminal?.element && terminalContextMenuHandler) {
    terminal.element.removeEventListener("contextmenu", terminalContextMenuHandler);
  }
  terminalContextMenuHandler = null;
  resizeObserver?.disconnect();
  unlistenOutput?.();
  unlistenExit?.();
  await disposeSession();
  terminal?.dispose();
  terminal = null;
});

const isReady = computed(() => Boolean(localSessionId.value));

const suggestionVisible = computed(
  () => canSuggest() && Boolean(suggestion.value) && getActiveDraft().trim().length >= 2,
);

const suggestionStripVisible = computed(
  () =>
    suggestionVisible.value ||
    (suggestionLoading.value && canSuggest() && getActiveDraft().trim().length >= 2),
);

watch(suggestionStripVisible, () => {
  void nextTick(() => handleResize());
});
</script>

<template>
  <div
    ref="paneRootRef"
    class="terminal-pane relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--warp-bg)]"
    :class="active ? 'terminal-pane--active' : ''"
    @mousedown="emit('focusPane')"
  >
    <div ref="containerRef" class="terminal-output min-h-0 w-full flex-1 px-4 py-3" />
    <div
      v-if="suggestionStripVisible"
      class="flex shrink-0 justify-center px-4 pb-3 pt-1"
    >
      <div
        class="w-[75%] max-w-3xl rounded-xl border border-[var(--warp-border)] bg-[var(--warp-elevated)] px-4 py-2.5 text-center shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
      >
        <div v-if="suggestionVisible" class="space-y-1 text-xs">
          <p class="text-[var(--warp-faint)]">Tab to accept</p>
          <p class="truncate font-mono text-[var(--warp-text)]">{{ suggestion }}</p>
        </div>
        <p v-else class="text-xs text-[var(--warp-faint)]">Suggesting…</p>
      </div>
    </div>
    <div
      v-if="!isReady"
      class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[var(--warp-faint)]"
    >
      Starting shell...
    </div>
    <TerminalPathContextMenu
      :open="pathMenuOpen"
      :x="pathMenuX"
      :y="pathMenuY"
      :path="pathMenuPath"
      :is-url="pathMenuIsUrl"
      @close="closePathMenu"
      @copy="copyPathFromMenu"
      @append="appendPathFromMenu"
      @open="openUrlFromMenu"
    />
    <div
      v-if="pathCopiedVisible"
      class="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-[var(--warp-border)] bg-[var(--warp-elevated)] px-3 py-1.5 text-xs text-[var(--warp-text)] shadow-lg"
    >
      Path copied
    </div>
  </div>
</template>
