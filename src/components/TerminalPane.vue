<script setup lang="ts">
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { TERMINAL_FONT_FAMILY, TERMINAL_FONT_SIZE } from "../lib/terminalFont";
import { isAgentExitCommand, isAgentLaunchCommand } from "../lib/terminalAgentMode";
import { fetchTerminalAutocompleteSuggestion } from "../lib/terminalAutocompleteApi";
import {
  useTerminalAutocompleteSettings,
} from "../lib/terminalAutocompleteSettings";
import { applyTerminalInputDraft } from "../lib/terminalInputDraft";
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

const { settings: autocompleteSettings } = useTerminalAutocompleteSettings();

const props = defineProps<{
  paneId: string;
  sessionId: string | null;
  shellId: string;
  active: boolean;
}>();

const emit = defineEmits<{
  sessionCreated: [paneId: string, sessionId: string];
  sessionEnded: [paneId: string];
  cwdChanged: [paneId: string, cwd: string];
  promptReady: [paneId: string];
  commandSubmitted: [command: string];
  focusPane: [];
}>();

const containerRef = ref<HTMLElement | null>(null);
const localSessionId = ref<string | null>(props.sessionId);
const pendingInput = ref("");
const draftInput = ref("");
const exchanges = ref<TerminalCommandExchange[]>([]);
const suggestion = ref<string | null>(null);
const suggestionLoading = ref(false);
const paneCwd = ref("");
const agentModeActive = ref(false);

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

const cwdPattern =
  /(?:PS\s+([A-Za-z]:\\[^\r\n>]+)|(?:\/[\w.-]+)+)(?:>|$)/;

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
  if (!capturingResponse || !lastSubmittedCommand) return;
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

function canSuggest(): boolean {
  const cfg = autocompleteSettings.value;
  return (
    props.active &&
    cfg.enabled &&
    isTerminalAutocompleteConfigured(cfg) &&
    !agentModeActive.value
  );
}

function scheduleSuggestion() {
  window.clearTimeout(suggestionTimer);
  if (!canSuggest()) {
    clearSuggestion();
    return;
  }

  const draft = draftInput.value.trim();
  if (draft.length < 2) {
    clearSuggestion();
    return;
  }

  suggestionTimer = window.setTimeout(() => {
    void requestSuggestion(draft);
  }, 450);
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
    if (requestId !== suggestionRequestId || draft !== draftInput.value.trim()) return;
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
  const draft = draftInput.value;
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
  const sessionId = await spawnTerminal(
    props.shellId,
    terminal.cols,
    terminal.rows,
  );
  localSessionId.value = sessionId;
  emit("sessionCreated", props.paneId, sessionId);
  await clearInitialScreen(sessionId);
}

function trackCwd(data: string) {
  const match = data.match(cwdPattern);
  if (match?.[1]) {
    const cwd = match[1].trim();
    paneCwd.value = cwd;
    finalizeExchange();
    emit("cwdChanged", props.paneId, cwd);
    emit("promptReady", props.paneId);
    scheduleSuggestion();
  }
}

function maybeRecordCommand(data: string) {
  pendingInput.value += data;
  if (!pendingInput.value.includes("\r") && !pendingInput.value.includes("\n")) {
    return;
  }

  const command = pendingInput.value.replace(/[\r\n]+/g, "").trim();
  pendingInput.value = "";
  if (!command || command.length > 200 || /[\u001b\u0007]/.test(command)) {
    return;
  }

  if (isAgentLaunchCommand(command)) agentModeActive.value = true;
  if (isAgentExitCommand(command)) agentModeActive.value = false;

  lastSubmittedCommand = command;
  capturingResponse = true;
  responseBuffer = "";
  clearSuggestion();
  emit("commandSubmitted", command);
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
    draftInput.value = applyTerminalInputDraft(draftInput.value, data);
    maybeRecordCommand(data);
    scheduleSuggestion();
    if (!localSessionId.value) {
      await ensureSession();
    }
    if (localSessionId.value) {
      await writeTerminal(localSessionId.value, data);
    }
  });

  unlistenOutput = await listen<TerminalOutputEvent>("terminal-output", (event) => {
    if (event.payload.sessionId !== localSessionId.value || !terminal) return;
    if (capturingResponse) responseBuffer += event.payload.data;
    terminal.write(event.payload.data);
    trackCwd(event.payload.data);
  });

  unlistenExit = await listen<TerminalExitEvent>("terminal-exit", (event) => {
    if (event.payload.sessionId !== localSessionId.value || !terminal) return;
    terminal.writeln("\r\n[session ended]");
    localSessionId.value = null;
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
  window.clearTimeout(resizeTimer);
  window.clearTimeout(suggestionTimer);
  suggestionRequestId += 1;
  resizeObserver?.disconnect();
  unlistenOutput?.();
  unlistenExit?.();
  await disposeSession();
  terminal?.dispose();
  terminal = null;
});

const isReady = computed(() => Boolean(localSessionId.value));

const suggestionVisible = computed(
  () => canSuggest() && Boolean(suggestion.value) && draftInput.value.trim().length >= 2,
);

const suggestionStripVisible = computed(
  () =>
    suggestionVisible.value ||
    (suggestionLoading.value && canSuggest() && draftInput.value.trim().length >= 2),
);

watch(suggestionStripVisible, () => {
  void nextTick(() => handleResize());
});
</script>

<template>
  <div
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
  </div>
</template>
