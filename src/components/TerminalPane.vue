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
import {
  killTerminal,
  resizeTerminal,
  spawnTerminal,
  writeTerminal,
} from "../lib/terminalApi";
import type { TerminalExitEvent, TerminalOutputEvent } from "../types/terminal";
import "@xterm/xterm/css/xterm.css";

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
  commandSubmitted: [command: string];
  focusPane: [];
}>();

const containerRef = ref<HTMLElement | null>(null);
const localSessionId = ref<string | null>(props.sessionId);
const pendingInput = ref("");

let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;
let unlistenOutput: UnlistenFn | null = null;
let unlistenExit: UnlistenFn | null = null;
let resizeTimer: number | undefined;

const cwdPattern =
  /(?:PS\s+([A-Za-z]:\\[^\r\n>]+)|(?:\/[\w.-]+)+)(?:>|$)/;

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
    emit("cwdChanged", props.paneId, match[1].trim());
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

  // Canvas renderer is sharper on Windows at common DPI scales than WebGL.

  fitAddon.fit();
  terminal.focus();

  terminal.onData(async (data) => {
    maybeRecordCommand(data);
    if (!localSessionId.value) {
      await ensureSession();
    }
    if (localSessionId.value) {
      await writeTerminal(localSessionId.value, data);
    }
  });

  unlistenOutput = await listen<TerminalOutputEvent>("terminal-output", (event) => {
    if (event.payload.sessionId !== localSessionId.value || !terminal) return;
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
}

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
    }
  },
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
  resizeObserver?.disconnect();
  unlistenOutput?.();
  unlistenExit?.();
  await disposeSession();
  terminal?.dispose();
  terminal = null;
});

const isReady = computed(() => Boolean(localSessionId.value));
</script>

<template>
  <div
    class="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--warp-bg)]"
    :class="active ? 'shadow-[inset_2px_0_0_0_var(--warp-accent)]' : ''"
    @mousedown="emit('focusPane')"
  >
    <div ref="containerRef" class="h-full w-full px-4 py-3" />
    <div
      v-if="!isReady"
      class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[var(--warp-faint)]"
    >
      Starting shell...
    </div>
  </div>
</template>
