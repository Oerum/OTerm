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
import { resolveSshTerminalTheme } from "../lib/sshTerminalThemes";
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
import { isDictationShortcut } from "../lib/appKeyboardShortcuts";
import {
  getCtrlDEofPayload,
  getMultilineEnterPayload,
  resolveCtrlDTerminalPayload,
  shouldForwardPtyKeyOverride,
} from "../lib/terminalMultilineEnter";
import { parseSshConnectError } from "../lib/sshSftpApi";
import {
  clearPendingSshTerminalLaunch,
  peekPendingSshTerminalLaunch,
} from "../lib/sshTerminalLaunch";
import {
  sshTerminalKill,
  sshTerminalResize,
  sshTerminalSpawn,
  sshTerminalWrite,
} from "../lib/sshTerminalApi";
import {
  killTerminal,
  resizeTerminal,
  spawnTerminal,
  writeTerminal,
} from "../lib/terminalApi";
import {
  containsBell,
  containsOscNotification,
  shouldMarkUnseenFromExplicitSignal,
  shouldMarkUnseenFromOutput,
  shouldMarkUnseenFromPrompt,
} from "../lib/terminalNotification";
import {
  clearAgentLifecycleDedupe,
  notifyAgentEnded,
  shouldTreatAgentPollClearAsCrash,
} from "../lib/agentLifecycle";
import { shouldForwardPtyResize } from "../lib/terminalResize";
import type { TerminalExitEvent, TerminalOutputEvent } from "../types/terminal";
import {
  isTerminalAutocompleteConfigured,
  type TerminalCommandExchange,
} from "../types/terminalAutocomplete";
import "@xterm/xterm/css/xterm.css";
import AgentComposer from "./AgentComposer.vue";
import TerminalPathContextMenu from "./TerminalPathContextMenu.vue";
import type { IDisposable } from "@xterm/xterm";

const { settings: autocompleteSettings } = useTerminalAutocompleteSettings();

const props = defineProps<{
  paneId: string;
  sessionId: string | null;
  shellId: string;
  initialCwd: string;
  active: boolean;
  tabActive: boolean;
  activeAgentId?: CliAgentId | null;
  themeId?: string | null;
  sshEndpointId?: string | null;
}>();

const isSshSession = computed(() => Boolean(props.sshEndpointId));

async function writeSession(sessionId: string, data: string) {
  if (isSshSession.value) return sshTerminalWrite(sessionId, data);
  return writeTerminal(sessionId, data);
}

async function resizeSession(sessionId: string, cols: number, rows: number) {
  if (isSshSession.value) return sshTerminalResize(sessionId, cols, rows);
  return resizeTerminal(sessionId, cols, rows);
}

async function killBackendSession(sessionId: string) {
  if (isSshSession.value) return sshTerminalKill(sessionId);
  return killTerminal(sessionId);
}

function resolveSessionIdToKill(): string | null {
  return backendSessionId.value ?? localSessionId.value ?? props.sessionId;
}

const SESSION_KILL_TIMEOUT_MS = 3000;

async function killBackendSessionIfPresent(sessionId: string | null) {
  if (!sessionId) return;
  await Promise.race([
    (async () => {
      try {
        await killBackendSession(sessionId);
      } catch {
        // Session may already be gone.
      }
      if (backendSessionId.value === sessionId) {
        backendSessionId.value = null;
      }
    })(),
    new Promise<void>((resolve) => window.setTimeout(resolve, SESSION_KILL_TIMEOUT_MS)),
  ]);
}

function bindSessionId(sessionId: string) {
  localSessionId.value = sessionId;
  backendSessionId.value = sessionId;
  sessionEndedLocally.value = false;
}

const emit = defineEmits<{
  sessionCreated: [paneId: string, sessionId: string];
  sessionEnded: [paneId: string];
  sessionReleased: [paneId: string];
  cwdChanged: [paneId: string, cwd: string];
  promptReady: [paneId: string];
  commandSubmitted: [command: string];
  agentModeChanged: [paneId: string, agentId: CliAgentId | null];
  oscTitleChanged: [paneId: string, title: string | null];
  notificationReceived: [paneId: string];
  focusPane: [];
  composerOpenChanged: [paneId: string, open: boolean];
}>();

const containerRef = ref<HTMLElement | null>(null);

const localSessionId = ref<string | null>(props.sessionId);
const backendSessionId = ref<string | null>(props.sessionId);
const sessionEndedLocally = ref(false);
const launchError = ref<string | null>(null);
const pendingInput = ref("");
const draftInput = ref("");
const exchanges = ref<TerminalCommandExchange[]>([]);
const suggestion = ref<string | null>(null);
const suggestionLoading = ref(false);
const paneCwd = ref("");
const activeAgentId = ref<CliAgentId | null>(props.activeAgentId ?? null);
const agentExitConfirmPending = ref(false);
const promptClearSuppressUntil = ref(0);
const awaitingOutputSinceFocus = ref(false);
const tuiModeActive = ref(Boolean(props.activeAgentId));
const pathMenuOpen = ref(false);
const pathMenuX = ref(0);
const pathMenuY = ref(0);
const pathMenuPath = ref<string | null>(null);
const pathMenuIsUrl = ref(false);
const pathMenuHasSelection = ref(false);
const pathCopiedVisible = ref(false);
const agentComposerRef = ref<InstanceType<typeof AgentComposer> | null>(null);
const agentComposerOpen = ref(false);
const agentCleanExitPending = ref(false);
let agentCleanExitTimer: number | undefined;

function markAgentCleanExitPending() {
  agentCleanExitPending.value = true;
  window.clearTimeout(agentCleanExitTimer);
  agentCleanExitTimer = window.setTimeout(() => {
    agentCleanExitPending.value = false;
  }, 3000);
}

function notificationContext() {
  return {
    paneActive: props.active,
    tabActive: props.tabActive,
    activeAgentId: activeAgentId.value,
    awaitingOutputSinceFocus: awaitingOutputSinceFocus.value,
  };
}

function emitNotificationIfNeeded(check: (ctx: ReturnType<typeof notificationContext>) => boolean) {
  if (check(notificationContext())) {
    emit("notificationReceived", props.paneId);
  }
}

function setActiveAgent(agentId: CliAgentId | null, emitChange = true) {
  if (activeAgentId.value === agentId) return;
  activeAgentId.value = agentId;
  tuiModeActive.value = Boolean(agentId);
  if (!agentId) {
    agentComposerOpen.value = false;
  }
  if (emitChange) emit("agentModeChanged", props.paneId, agentId);
}

function isComposerToggleShortcut(event: KeyboardEvent): boolean {
  return (
    event.type === "keydown" &&
    event.key === "Enter" &&
    event.ctrlKey &&
    event.shiftKey &&
    !event.altKey &&
    !event.metaKey
  );
}

function openAgentComposer() {
  if (!isReady.value || !localSessionId.value) return;
  agentComposerOpen.value = true;
}

function closeAgentComposer() {
  agentComposerOpen.value = false;
}

function toggleAgentComposer() {
  if (agentComposerOpen.value) {
    closeAgentComposer();
  } else {
    openAgentComposer();
  }
}

function onAgentComposerSubmitted() {
  closeAgentComposer();
  terminal?.focus();
}

watch(agentComposerOpen, (open) => {
  if (props.active) {
    emit("composerOpenChanged", props.paneId, open);
  }
});

watch(
  () => props.active,
  (active) => {
    if (active) {
      emit("composerOpenChanged", props.paneId, agentComposerOpen.value);
    }
  },
);

watch(
  () => props.activeAgentId,
  (agentId, previous) => {
    const previousAgentId = previous ?? null;
    const nextAgentId = agentId ?? null;
    if (
      shouldTreatAgentPollClearAsCrash({
        previousAgentId,
        nextAgentId,
        sessionAlive: Boolean(localSessionId.value),
        cleanExitPending: agentCleanExitPending.value,
      })
    ) {
      notifyAgentEnded(props.paneId, previousAgentId, "crash");
    }
    setActiveAgent(nextAgentId, false);
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
let sshStartupSnippetPending: string | null = null;
let lastSubmittedCommand = "";
let responseBuffer = "";
let promptScanBuffer = "";
let outputNotifyTimer: number | undefined;
const OUTPUT_NOTIFY_DEBOUNCE_MS = 400;
let linkProviderDisposable: IDisposable | null = null;
let pathDecorationDisposables: IDisposable[] = [];
let pathRefreshDisposables: IDisposable[] = [];
let pathDecorationTimer: number | undefined;
let pathCopiedTimer: number | undefined;
let terminalContextMenuHandler: ((event: MouseEvent) => void) | null = null;
let sessionBootstrap: Promise<void> | null = null;
let disposed = false;
let bootstrapGeneration = 0;
let sshExitFallbackTimer: number | undefined;
const pendingBootstrapInput: string[] = [];

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
  await writeSession(localSessionId.value, payload);
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
  event.preventDefault();
  pathMenuX.value = event.clientX;
  pathMenuY.value = event.clientY;
  pathMenuHasSelection.value = terminal.hasSelection();
  if (hit) {
    pathMenuPath.value = hit.text;
    pathMenuIsUrl.value = isHttpUrl(hit.text);
  } else {
    pathMenuPath.value = null;
    pathMenuIsUrl.value = false;
  }
  pathMenuOpen.value = true;
}

async function copySelectedText() {
  if (!terminal) return;
  const selection = terminal.getSelection();
  if (selection) {
    try {
      await navigator.clipboard.writeText(selection);
    } catch {
      // Clipboard may be unavailable.
    }
  }
  closePathMenu();
}

async function pasteText() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      void forwardTerminalInput(text);
    }
  } catch {
    // Clipboard may be unavailable.
  }
  closePathMenu();
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
    !isSshSession.value &&
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
  await writeSession(localSessionId.value, toWrite);
  draftInput.value = line.startsWith(draft) ? line : draft + toWrite;
  clearSuggestion();
}

async function clearInitialScreen(sessionId: string) {
  if (!terminal || isSshSession.value) return;
  terminal.clear();
  terminal.reset();

  if (props.shellId === "cmd") {
    await writeSession(sessionId, "cls\r");
    return;
  }

  if (props.shellId === "pwsh" || props.shellId === "powershell") {
    await writeSession(sessionId, "Clear-Host\r");
    return;
  }

  await writeSession(sessionId, "\x1b[2J\x1b[3J\x1b[H");
}

async function ensureSshSession() {
  const generation = bootstrapGeneration;
  const pending = peekPendingSshTerminalLaunch(props.paneId);
  if (!pending || !terminal) {
    throw new Error(
      props.sshEndpointId
        ? "SSH session ended. Reopen this host from the SSH/SFTP manager."
        : "SSH terminal launch configuration is missing.",
    );
  }

  let request = { ...pending.request };
  sshStartupSnippetPending = pending.startupSnippet;
  while (true) {
    if (disposed || generation !== bootstrapGeneration) return;
    try {
      const sessionId = await sshTerminalSpawn(
        request,
        terminal.cols,
        terminal.rows,
        null,
      );
      if (disposed || generation !== bootstrapGeneration) {
        await killBackendSession(sessionId);
        return;
      }
      bindSessionId(sessionId);
      launchError.value = null;
      emit("sessionCreated", props.paneId, sessionId);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const hostKeyError = parseSshConnectError(message);
      if (hostKeyError?.code === "HOST_KEY_UNKNOWN") {
        const trusted = await pending.trustHostKey(hostKeyError);
        if (!trusted) throw err;
        request = { ...request, acceptHostKey: true };
        continue;
      }
      throw err;
    }
  }
}

async function flushPendingBootstrapInput() {
  if (!localSessionId.value || pendingBootstrapInput.length === 0) return;
  const queued = pendingBootstrapInput.splice(0);
  for (const chunk of queued) {
    await writeSession(localSessionId.value, chunk);
  }
}

async function bootstrapSession() {
  if (
    disposed ||
    sessionEndedLocally.value ||
    !props.tabActive ||
    localSessionId.value ||
    launchError.value ||
    !terminal ||
    !fitAddon
  ) {
    return;
  }
  if (sessionBootstrap) return sessionBootstrap;

  sessionBootstrap = (async () => {
    const generation = bootstrapGeneration;
    try {
      if (disposed || generation !== bootstrapGeneration) return;
      fitAddon!.fit();
      if (isSshSession.value) {
        await ensureSshSession();
      } else {
        const cwd =
          props.initialCwd && props.initialCwd !== "~" ? props.initialCwd : undefined;
        const sessionId = await spawnTerminal(
          props.shellId,
          terminal!.cols,
          terminal!.rows,
          cwd,
        );
        if (disposed || generation !== bootstrapGeneration) {
          await killBackendSession(sessionId);
          return;
        }
        bindSessionId(sessionId);
        launchError.value = null;
        emit("sessionCreated", props.paneId, sessionId);
        await clearInitialScreen(sessionId);
      }
      await flushPendingBootstrapInput();
    } catch (err) {
      pendingBootstrapInput.length = 0;
      const message = err instanceof Error ? err.message : String(err);
      launchError.value = message;
      terminal?.writeln(`\r\n[launch failed] ${message}`);
    } finally {
      sessionBootstrap = null;
    }
  })();

  return sessionBootstrap;
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
    if (activeAgentId.value && !next.activeAgentId) {
      markAgentCleanExitPending();
    }
    setActiveAgent(next.activeAgentId);
  }
  agentExitConfirmPending.value = next.agentExitConfirmPending;

  if (!next.trailingPrompt) return;

  if (!activeAgentId.value) {
    tuiModeActive.value = false;
  }
  paneCwd.value = next.trailingPrompt.cwd;
  finalizeExchange();
  promptScanBuffer = "";
  emit("cwdChanged", props.paneId, next.trailingPrompt.cwd);
  const ctx = notificationContext();
  if (shouldMarkUnseenFromPrompt(ctx)) {
    emit("notificationReceived", props.paneId);
    awaitingOutputSinceFocus.value = false;
  }
  emit("promptReady", props.paneId);
  scheduleSuggestion();
}

function handleOutputNotification(data: string) {
  if (containsBell(data) || containsOscNotification(data)) {
    emitNotificationIfNeeded(shouldMarkUnseenFromExplicitSignal);
    return;
  }

  if (!shouldMarkUnseenFromOutput(notificationContext())) return;

  window.clearTimeout(outputNotifyTimer);
  outputNotifyTimer = window.setTimeout(() => {
    emitNotificationIfNeeded(shouldMarkUnseenFromOutput);
    awaitingOutputSinceFocus.value = false;
  }, OUTPUT_NOTIFY_DEBOUNCE_MS);
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
    const wasAgent = Boolean(activeAgentId.value);
    setActiveAgent(null);
    agentExitConfirmPending.value = false;
    promptClearSuppressUntil.value = 0;
    if (isSshSession.value && !wasAgent && !tuiModeActive.value) {
      window.clearTimeout(sshExitFallbackTimer);
      sshExitFallbackTimer = window.setTimeout(() => {
        if (localSessionId.value) {
          void shutdownSession(true);
        }
      }, 500);
    }
  }

  lastSubmittedCommand = command;
  capturingResponse = true;
  responseBuffer = "";
  awaitingOutputSinceFocus.value = true;
  clearSuggestion();
  emit("commandSubmitted", command);
}

async function forwardTerminalInput(data: string) {
  if (disposed) return;

  const isEnter = /[\r\n]/.test(data);
  const commandLine = isEnter ? getActiveDraft() : "";

  draftInput.value = applyTerminalInputDraft(draftInput.value, data);
  if (lastSubmittedCommand && draftInput.value.trim().length > 0) {
    finalizeExchange();
    promptScanBuffer = "";
  }
  maybeRecordCommand(data, commandLine);
  scheduleSuggestion();

  if (localSessionId.value) {
    await writeSession(localSessionId.value, data);
    return;
  }
  if (launchError.value) return;

  pendingBootstrapInput.push(data);
  if (!props.tabActive) return;
  await bootstrapSession();
  if (localSessionId.value) {
    await flushPendingBootstrapInput();
  }
}

function onWindowKeyCapture(event: KeyboardEvent) {
  if (props.active && isComposerToggleShortcut(event)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleAgentComposer();
    return;
  }

  if (props.active && agentComposerOpen.value && isDictationShortcut(event)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    agentComposerRef.value?.toggleDictation();
    return;
  }

  if (!shouldForwardPtyKeyOverride(event, props.active, containerRef.value)) return;

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

async function syncPtyResize() {
  if (!terminal || !localSessionId.value) return;
  if (
    !shouldForwardPtyResize({
      tabActive: props.tabActive,
      cols: terminal.cols,
      rows: terminal.rows,
    })
  ) {
    return;
  }
  await resizeSession(localSessionId.value, terminal.cols, terminal.rows);
}

async function handleResize() {
  if (!terminal || !fitAddon || !localSessionId.value) return;
  if (props.tabActive) {
    fitAddon.fit();
  }
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    void syncPtyResize();
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
    allowTransparency: true,
    theme: resolveSshTerminalTheme(props.themeId),
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
    terminal.onResize(() => schedulePathDecorations()),
  );
  if (terminal.element) {
    terminalContextMenuHandler = onTerminalContextMenu;
    terminal.element.addEventListener("contextmenu", terminalContextMenuHandler);
  }

  terminal.onTitleChange((title) => {
    const normalized = title.trim() || null;
    emit("oscTitleChanged", props.paneId, normalized);
  });

  terminal.onBell(() => {
    emitNotificationIfNeeded(shouldMarkUnseenFromExplicitSignal);
  });

  terminal.attachCustomKeyEventHandler((event) => {
    const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    
    // Copy shortcut (Ctrl+C / Cmd+C when selection exists)
    const isCopy = (isMac && event.metaKey && event.key.toLowerCase() === "c" && !event.ctrlKey && !event.altKey) ||
                   (!isMac && event.ctrlKey && event.key.toLowerCase() === "c" && !event.metaKey && !event.altKey);
    if (isCopy && terminal && terminal.hasSelection()) {
      if (event.type === "keydown") {
        navigator.clipboard.writeText(terminal.getSelection()).catch(() => {});
      }
      event.preventDefault();
      return false;
    }

    // Paste shortcut (Ctrl+V / Cmd+V)
    const isPaste = (isMac && event.metaKey && event.key.toLowerCase() === "v" && !event.ctrlKey && !event.altKey) ||
                    (!isMac && event.ctrlKey && event.key.toLowerCase() === "v" && !event.metaKey && !event.altKey);
    if (isPaste && terminal) {
      if (event.type === "keydown") {
        navigator.clipboard.readText().then((text) => {
          if (text) {
            void forwardTerminalInput(text);
          }
        }).catch(() => {});
      }
      event.preventDefault();
      return false;
    }

    if (!suggestion.value || isSshSession.value) return true;
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
    if (sshStartupSnippetPending) {
      const snippet = sshStartupSnippetPending;
      sshStartupSnippetPending = null;
      void writeSession(event.payload.sessionId, `${snippet}\r`);
    }
    if (capturingResponse) responseBuffer += event.payload.data;
    terminal.write(event.payload.data);
    handleOutputNotification(event.payload.data);
    trackCwd(event.payload.data);
    schedulePathDecorations();
  });

  unlistenExit = await listen<TerminalExitEvent>("terminal-exit", (event) => {
    if (disposed) return;
    const activeSessionId = backendSessionId.value ?? localSessionId.value;
    if (event.payload.sessionId !== activeSessionId || !terminal) return;

    disposed = true;
    sessionEndedLocally.value = true;
    bootstrapGeneration += 1;
    pendingBootstrapInput.length = 0;
    window.clearTimeout(sshExitFallbackTimer);
    const endedAgentId = activeAgentId.value;
    if (endedAgentId) {
      notifyAgentEnded(props.paneId, endedAgentId, "session_ended", {
        exitCode: event.payload.exitCode,
      });
    }
    setActiveAgent(null);
    agentExitConfirmPending.value = false;
    promptClearSuppressUntil.value = 0;
    tuiModeActive.value = false;
    clearPathDecorations();
    localSessionId.value = null;
    backendSessionId.value = null;
    void killBackendSessionIfPresent(event.payload.sessionId);
    emit("oscTitleChanged", props.paneId, null);
    emit("sessionEnded", props.paneId);
  });

  resizeObserver = new ResizeObserver(() => {
    void handleResize();
  });
  resizeObserver.observe(containerRef.value);

  if (props.tabActive) {
    await bootstrapSession();
  }
}

const SHUTDOWN_BOOTSTRAP_TIMEOUT_MS = 2500;

async function waitForBootstrapAbort() {
  if (!sessionBootstrap) return;
  const bootstrap = sessionBootstrap;
  sessionBootstrap = null;
  await Promise.race([
    bootstrap.catch(() => {}),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, SHUTDOWN_BOOTSTRAP_TIMEOUT_MS);
    }),
  ]);
}

type ShutdownOptions = {
  markEndedLocally?: boolean;
};

async function shutdownSession(
  emitSessionEnded: boolean,
  options: ShutdownOptions = {},
) {
  disposed = true;
  if (options.markEndedLocally ?? emitSessionEnded) {
    sessionEndedLocally.value = true;
  }
  bootstrapGeneration += 1;
  window.clearTimeout(sshExitFallbackTimer);
  if (isSshSession.value) {
    clearPendingSshTerminalLaunch(props.paneId);
    sshStartupSnippetPending = null;
  }
  pendingBootstrapInput.length = 0;
  await waitForBootstrapAbort();
  const sessionId = resolveSessionIdToKill();
  localSessionId.value = null;
  backendSessionId.value = null;
  await killBackendSessionIfPresent(sessionId);
  emit("oscTitleChanged", props.paneId, null);
  if (emitSessionEnded) {
    emit("sessionEnded", props.paneId);
  }
}

function getBackendSessionId(): string | null {
  return resolveSessionIdToKill();
}

function killSession() {
  return shutdownSession(false, { markEndedLocally: true });
}

async function scheduleTerminalFocus() {
  if (!props.active || !props.tabActive) return;
  await nextTick();
  if (!props.active || !props.tabActive) return;
  if (agentComposerVisible.value) {
    await agentComposerRef.value?.focusComposer();
    return;
  }
  terminal?.focus();
}

function focusTerminal() {
  void scheduleTerminalFocus();
}

defineExpose({
  focusTerminal,
  toggleAgentComposer,
  openAgentComposer,
  closeAgentComposer,
  isAgentComposerOpen: () => agentComposerOpen.value,
  killSession,
  getBackendSessionId,
});

onMounted(async () => {
  localSessionId.value = props.sessionId;
  backendSessionId.value = props.sessionId;
  await nextTick();
  window.addEventListener("keydown", onWindowKeyCapture, true);
  await mountTerminal();
});

watch(
  () => [props.active, props.tabActive] as const,
  ([active, tabActive]) => {
    if (active && tabActive) {
      awaitingOutputSinceFocus.value = false;
      window.clearTimeout(outputNotifyTimer);
      void scheduleTerminalFocus();
      void handleResize();
      scheduleSuggestion();
    } else if (!active) {
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
  () => props.tabActive,
  (tabActive) => {
    if (
      tabActive &&
      terminal &&
      !disposed &&
      !sessionEndedLocally.value &&
      !localSessionId.value &&
      !launchError.value
    ) {
      if (props.sessionId) {
        bindSessionId(props.sessionId);
      } else {
        launchError.value = null;
        void bootstrapSession();
      }
    }
  },
);

watch(
  () => props.sessionId,
  (sessionId) => {
    if (
      sessionId &&
      !localSessionId.value &&
      !disposed &&
      !sessionEndedLocally.value
    ) {
      bindSessionId(sessionId);
    }
  },
);

watch(
  () => props.shellId,
  async (shellId, previous) => {
    if (shellId === previous || !terminal || isSshSession.value) return;
    launchError.value = null;
    pendingBootstrapInput.length = 0;
    sessionEndedLocally.value = false;
    await shutdownSession(false, { markEndedLocally: false });
    disposed = false;
    bootstrapGeneration += 1;
    await bootstrapSession();
  },
);

onBeforeUnmount(async () => {
  window.removeEventListener("keydown", onWindowKeyCapture, true);
  window.clearTimeout(resizeTimer);
  window.clearTimeout(suggestionTimer);
  window.clearTimeout(outputNotifyTimer);
  window.clearTimeout(pathDecorationTimer);
  window.clearTimeout(pathCopiedTimer);
  window.clearTimeout(agentCleanExitTimer);
  window.clearTimeout(sshExitFallbackTimer);
  clearAgentLifecycleDedupe(props.paneId);
  suggestionRequestId += 1;
  pendingBootstrapInput.length = 0;
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
  await shutdownSession(false, { markEndedLocally: false });
  terminal?.dispose();
  terminal = null;
});

const isReady = computed(() => Boolean(localSessionId.value));

const currentTheme = computed(() => resolveSshTerminalTheme(props.themeId));
const terminalBgStyle = computed(() => {
  const bg = currentTheme.value.background;
  if (!bg || bg === "transparent") {
    return { backgroundColor: "var(--oterm-bg)" };
  }
  return { backgroundColor: bg };
});

watch(
  () => props.themeId,
  (themeId) => {
    if (terminal) {
      terminal.options.theme = resolveSshTerminalTheme(themeId);
    }
  },
);

const agentComposerVisible = computed(() =>
  Boolean(isReady.value && localSessionId.value && agentComposerOpen.value),
);

watch(agentComposerVisible, (visible) => {
  if (terminal) {
    terminal.options.disableStdin = visible;
  }
  void nextTick(() => {
    if (visible) {
      void agentComposerRef.value?.focusComposer();
    } else if (props.active && props.tabActive) {
      terminal?.focus();
    }
    void handleResize();
  });
});

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
    class="terminal-pane relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    :class="active ? 'terminal-pane--active' : ''"
    :style="terminalBgStyle"
    @mousedown="emit('focusPane')"
  >
    <div ref="containerRef" class="terminal-output min-h-0 w-full flex-1 px-4 py-3" />
    <AgentComposer
      v-if="agentComposerVisible && localSessionId"
      ref="agentComposerRef"
      :pane-id="paneId"
      :agent-id="activeAgentId"
      :session-id="localSessionId"
      @submitted="onAgentComposerSubmitted"
      @close="closeAgentComposer"
      @layout-change="handleResize"
    />
    <div
      v-if="suggestionStripVisible"
      class="flex shrink-0 justify-center px-4 pb-3 pt-1"
    >
      <div
        class="w-[75%] max-w-3xl rounded-xl border border-[var(--oterm-border)] bg-[var(--oterm-elevated)] px-4 py-2.5 text-center shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
      >
        <div v-if="suggestionVisible" class="space-y-1 text-xs">
          <p class="text-[var(--oterm-faint)]">Tab to accept</p>
          <p class="truncate font-mono text-[var(--oterm-text)]">{{ suggestion }}</p>
        </div>
        <p v-else class="text-xs text-[var(--oterm-faint)]">Suggesting…</p>
      </div>
    </div>
    <div
      v-if="!isReady && !sessionEndedLocally"
      class="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm"
      :class="launchError ? 'text-[var(--oterm-danger)]' : 'text-[var(--oterm-faint)]'"
    >
      {{ launchError ?? "Starting shell..." }}
    </div>
    <TerminalPathContextMenu
      :open="pathMenuOpen"
      :x="pathMenuX"
      :y="pathMenuY"
      :path="pathMenuPath"
      :is-url="pathMenuIsUrl"
      :has-selection="pathMenuHasSelection"
      @close="closePathMenu"
      @copy="copyPathFromMenu"
      @append="appendPathFromMenu"
      @open="openUrlFromMenu"
      @copy-selection="copySelectedText"
      @paste="pasteText"
    />
    <div
      v-if="pathCopiedVisible"
      class="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-[var(--warp-border)] bg-[var(--warp-elevated)] px-3 py-1.5 text-xs text-[var(--warp-text)] shadow-lg"
    >
      Path copied
    </div>
  </div>
</template>
