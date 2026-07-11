<script setup lang="ts">
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { TERMINAL_FONT_FAMILY, TERMINAL_FONT_SIZE } from "../lib/terminalFont";
import { resolveTerminalTheme } from "../lib/terminalThemes";
import { TerminalBlockRenderer } from "../lib/terminalBlockRenderer";
import {
  applyTerminalThemeCssVars,
  useTerminalAppearanceSettings,
} from "../lib/terminalAppearanceSettings";
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
import {
  resolveTerminalAutocompleteInput,
  resolveTerminalDraftInput,
  readTerminalCurrentInput,
} from "../lib/terminalCurrentInput";
import {
  appendPromptScanBuffer,
  isPlausiblePromptCwd,
  looksLikeTuiTransition,
} from "../lib/terminalPrompt";
import {
  findTerminalLinkAtMouseEvent,
  isHttpUrl,
  pathMatchToLinkRange,
  scanLineForTerminalLinks,
} from "../lib/terminalPaths";
import {
  resolveTerminalLinkCtrlClickAction,
  shouldEnableTerminalPathInteractions,
} from "../lib/terminalLinkInteraction";
import { isDictationShortcut } from "../lib/appKeyboardShortcuts";
import { isActionKeybind } from "../lib/keybindSettings";
import {
  getCtrlBackspaceWordDeletePayload,
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
import { pushAppToast } from "../lib/appToast";
import {
  clipboardHasPasteableImage,
  readNativeClipboardImagePath,
  readClipboardText,
  saveGeminiClipboardImage,
  writeClipboardText,
} from "../lib/clipboard";
import {
  isMediaAttachmentPath,
  readClipboardImagePaths,
} from "../lib/agentComposerAttachments";
import {
  insertAgentPromptText,
} from "../lib/agentComposerSubmit";
import {
  drainTerminalOutput,
  killTerminal,
  queryTerminalActiveAgent,
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
import {
  buildAgentExitMarkerSuffix,
  processAgentExitMarkerChunk,
} from "../lib/terminalAgentExitMarker";
import {
  parseDetectedCliAgentId,
  reconcileActiveAgentId,
} from "../lib/terminalAgentReconcile";
import { shouldShowScrollToBottom } from "../lib/terminalScroll";
import {
  appendOutputTail,
  classifyAgentStatus,
} from "../lib/agentStatus";
import type { AgentSemanticStatus } from "../types/terminal";
import {
  isValidPtySize,
  MOUNT_CONTAINER_WAIT_MAX_FRAMES,
  PTY_LAYOUT_WAIT_MAX_FRAMES,
  shouldBlockBootstrap,
  shouldForwardPtyResize,
} from "../lib/terminalResize";
import {
  areTerminalEventListenersReady,
  shouldBootstrapTerminalAfterListenerSetup,
} from "../lib/terminalBootstrap";
import type { TerminalExitEvent, TerminalOutputEvent } from "../types/terminal";
import {
  isTerminalAutocompleteConfigured,
  type TerminalCommandExchange,
} from "../types/terminalAutocomplete";
import "@xterm/xterm/css/xterm.css";
import AgentComposer from "./AgentComposer.vue";
import TerminalPathContextMenu from "./TerminalPathContextMenu.vue";
import type { IDisposable } from "@xterm/xterm";
import ChatView from "./ChatView.vue";

const { settings: autocompleteSettings } = useTerminalAutocompleteSettings();
const { state: appearanceState } = useTerminalAppearanceSettings();

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
  chatViewOpen?: boolean;
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
  return (
    backendSessionId.value ??
    localSessionId.value ??
    bootstrappingSessionId ??
    props.sessionId
  );
}

const intentionallyKilledSessions = new Set<string>();

async function killBootstrapSession(sessionId: string) {
  intentionallyKilledSessions.add(sessionId);
  try {
    await killBackendSession(sessionId);
  } catch {
    intentionallyKilledSessions.delete(sessionId);
  }
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
  bootstrappingSessionId = null;
  bootstrapAwaitingLayout = false;
  launchError.value = null;
  sessionEndedLocally.value = false;
}

function activeOutputSessionId(): string | null {
  return localSessionId.value ?? bootstrappingSessionId;
}

/** Single PTY output sink. Prompt detection and decorations read the xterm
 * buffer, which only reflects a write inside its parse callback — calling
 * them synchronously froze finished blocks at stale one-row spans. */
function writeTerminalOutput(output: string) {
  if (!terminal) return;
  blockRenderer?.appendOutput(output);
  handleOutputNotification(output);
  noteOutputActivity(output);
  terminal.write(output, () => {
    if (disposed || !terminal) return;
    trackCwd(output);
    schedulePathDecorations();
    updateScrollToBottomVisibility();
  });
}

async function replayPendingOutput(sessionId: string) {
  if (isSshSession.value || !terminal) return;
  try {
    const drained = await drainTerminalOutput(sessionId);
    if (!drained || disposed || localSessionId.value !== sessionId) return;
    hasReceivedTerminalOutput = true;
    cancelPromptKick();
    writeTerminalOutput(prepareTerminalOutput(drained));
  } catch {
    // Best-effort replay for output emitted before the listener attached.
  }
}

async function spawnTerminalWithTimeout(
  shellId: string,
  cols: number,
  rows: number,
  cwd?: string,
): Promise<string> {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      spawnTerminal(shellId, cols, rows, cwd),
      new Promise<string>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error("Shell spawn timed out"));
        }, SPAWN_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

function notifySessionBootstrapping(sessionId: string) {
  bootstrappingSessionId = sessionId;
  emit("sessionBootstrapping", props.paneId, sessionId);
}

const emit = defineEmits<{
  sessionCreated: [paneId: string, sessionId: string];
  sessionBootstrapping: [paneId: string, sessionId: string];
  sessionEnded: [paneId: string];
  sessionReleased: [paneId: string];
  cwdChanged: [paneId: string, cwd: string];
  promptReady: [paneId: string];
  commandSubmitted: [command: string];
  agentModeChanged: [paneId: string, agentId: CliAgentId | null];
  agentStatusChanged: [paneId: string, status: AgentSemanticStatus];
  oscTitleChanged: [paneId: string, title: string | null];
  notificationReceived: [paneId: string, completedAgentId?: CliAgentId | null];
  focusPane: [];
  composerOpenChanged: [paneId: string, open: boolean];
}>();

const containerRef = ref<HTMLElement | null>(null);
const isDraggingOverThisPane = ref(false);
let unlistenDragDrop: (() => void) | null = null;

const localSessionId = ref<string | null>(null);
const backendSessionId = ref<string | null>(null);
const sessionEndedLocally = ref(false);
const launchError = ref<string | null>(null);
const pendingInput = ref("");
const draftInput = ref("");
const lastNonEmptyDraft = ref("");
const exchanges = ref<TerminalCommandExchange[]>([]);
const suggestion = ref<string | null>(null);
const suggestionLoading = ref(false);
const paneCwd = ref("");
const activeAgentId = ref<CliAgentId | null>(props.activeAgentId ?? null);
const agentExitConfirmPending = ref(false);
const promptClearSuppressUntil = ref(0);
const awaitingOutputSinceFocus = ref(false);
const tuiModeActive = ref(false);
const pathMenuOpen = ref(false);
const pathMenuX = ref(0);
const pathMenuY = ref(0);
const pathMenuPath = ref<string | null>(null);
const pathMenuIsUrl = ref(false);
const pathMenuHasSelection = ref(false);
const pathCopiedVisible = ref(false);
const agentComposerRef = ref<InstanceType<typeof AgentComposer> | null>(null);
const agentComposerOpen = ref(false);
const bootstrapComplete = ref(false);
const agentCleanExitPending = ref(false);
const pendingAgentExitMarkerId = ref<CliAgentId | null>(null);
const showScrollToBottom = ref(false);
const localOscTitle = ref<string | null>(null);
const lastKnownAgentId = ref<CliAgentId | null>(props.activeAgentId ?? null);
let outputTail = "";
let hasRecentOutput = false;
let lastEmittedAgentStatus: AgentSemanticStatus | null = null;
let recentOutputTimer: number | undefined;
const RECENT_OUTPUT_MS = 2500;
let agentCleanExitTimer: number | undefined;
let agentResyncTimer: number | undefined;
let agentResyncRequestId = 0;
let agentExitMarkerCarry = "";

function clearAgentCleanExitPending() {
  agentCleanExitPending.value = false;
  window.clearTimeout(agentCleanExitTimer);
}

function markAgentCleanExitPending() {
  agentCleanExitPending.value = true;
  window.clearTimeout(agentCleanExitTimer);
  agentCleanExitTimer = window.setTimeout(() => {
    agentCleanExitPending.value = false;
  }, 3000);
}

function clearPendingAgentExitMarker() {
  pendingAgentExitMarkerId.value = null;
  agentExitMarkerCarry = "";
}

function updateScrollToBottomVisibility() {
  if (!terminal) {
    showScrollToBottom.value = false;
    return;
  }
  const buffer = terminal.buffer.active;
  showScrollToBottom.value = shouldShowScrollToBottom(
    buffer.viewportY,
    buffer.baseY,
  );
}

function scrollTerminalToBottom() {
  terminal?.scrollToBottom();
  terminal?.focus();
  updateScrollToBottomVisibility();
}

function handleAgentExitMarker(exitCode: number) {
  const agentId = pendingAgentExitMarkerId.value ?? activeAgentId.value;
  pendingAgentExitMarkerId.value = null;
  if (!agentId) return;

  if (exitCode === 0) {
    markAgentCleanExitPending();
    return;
  }

  clearAgentCleanExitPending();
  notifyAgentEnded(props.paneId, agentId, "crash", { exitCode });
  setActiveAgent(null);
  agentExitConfirmPending.value = false;
  promptClearSuppressUntil.value = 0;
}

function prepareTerminalOutput(data: string): string {
  const parsed = processAgentExitMarkerChunk(agentExitMarkerCarry, data);
  agentExitMarkerCarry = parsed.carry;
  for (const marker of parsed.markers) {
    handleAgentExitMarker(marker.exitCode);
  }
  return parsed.stripped;
}

function maybeAugmentEnterPayload(data: string, commandLine: string): string {
  if (activeAgentId.value) return data;
  if (!/[\r\n]/.test(data) || isSshSession.value) return data;

  const command = normalizeSubmittedCommand(commandLine);
  const agentId = detectCliAgent(command);
  const suffix = agentId ? buildAgentExitMarkerSuffix(props.shellId) : null;
  if (!agentId || !suffix) return data;

  pendingAgentExitMarkerId.value = agentId;
  clearAgentCleanExitPending();

  const lineEnding = data.includes("\r\n")
    ? "\r\n"
    : data.includes("\r")
      ? "\r"
      : "\n";
  return `${suffix}${lineEnding}`;
}

function notificationContext() {
  return {
    paneActive: props.active,
    tabActive: props.tabActive,
    activeAgentId: activeAgentId.value,
    awaitingOutputSinceFocus: awaitingOutputSinceFocus.value,
  };
}

function noteOutputActivity(data: string) {
  outputTail = appendOutputTail(outputTail, data);
  hasRecentOutput = true;
  window.clearTimeout(recentOutputTimer);
  recentOutputTimer = window.setTimeout(() => {
    hasRecentOutput = false;
    updateAgentStatus();
  }, RECENT_OUTPUT_MS);
  updateAgentStatus();
}

function resolveAgentSemanticStatus(): AgentSemanticStatus {
  if (activeAgentId.value) {
    return classifyAgentStatus({
      activeAgentId: activeAgentId.value,
      outputTail,
      oscTitle: localOscTitle.value,
      hasRecentOutput,
    });
  }
  return lastKnownAgentId.value ? "idle" : "unknown";
}

function updateAgentStatus() {
  const status = resolveAgentSemanticStatus();
  if (status === lastEmittedAgentStatus) return;
  lastEmittedAgentStatus = status;
  emit("agentStatusChanged", props.paneId, status);
}

function resetAgentStatusTracking() {
  outputTail = "";
  hasRecentOutput = false;
  localOscTitle.value = null;
  lastKnownAgentId.value = null;
  lastEmittedAgentStatus = null;
  window.clearTimeout(recentOutputTimer);
}

function emitNotificationIfNeeded(
  check: (ctx: ReturnType<typeof notificationContext>) => boolean,
  completedAgentId?: CliAgentId | null,
) {
  if (check(notificationContext())) {
    emit("notificationReceived", props.paneId, completedAgentId);
  }
}

function markAgentLaunchState() {
  clearAgentCleanExitPending();
  agentExitConfirmPending.value = false;
  promptClearSuppressUntil.value = agentLaunchPromptClearSuppressUntil();
}

function setActiveAgent(agentId: CliAgentId | null, emitChange = true) {
  if (agentId && activeAgentId.value === agentId) {
    markAgentLaunchState();
    return;
  }
  if (activeAgentId.value === agentId) return;
  activeAgentId.value = agentId;
  if (!agentId) {
    agentComposerOpen.value = false;
  } else {
    markAgentLaunchState();
    lastKnownAgentId.value = agentId;
  }
  if (emitChange) emit("agentModeChanged", props.paneId, agentId);
  updateAgentStatus();
}

async function syncActiveAgentFromProcess() {
  if (!localSessionId.value || activeAgentId.value || isSshSession.value) return;

  const sessionId = localSessionId.value;
  const requestId = ++agentResyncRequestId;
  try {
    const detected = await queryTerminalActiveAgent(sessionId);
    if (requestId !== agentResyncRequestId || sessionId !== localSessionId.value) return;

    const detectedId = parseDetectedCliAgentId(detected);
    const nextId = reconcileActiveAgentId(activeAgentId.value, detectedId);
    if (nextId) {
      setActiveAgent(nextId);
    }
  } catch {
    // Process query is best-effort reconciliation.
  }
}

function scheduleAgentResyncAfterClear() {
  window.clearTimeout(agentResyncTimer);
  agentResyncTimer = window.setTimeout(() => {
    void syncActiveAgentFromProcess();
  }, 300);
}

function isComposerToggleShortcut(event: KeyboardEvent): boolean {
  return event.type === "keydown" && isActionKeybind(event, "composer-toggle");
}

function openAgentComposer() {
  if (!bootstrapComplete.value || !isReady.value || !localSessionId.value) return;
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
let eventListenersSetup: Promise<void> | null = null;
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
let blockRenderer: TerminalBlockRenderer | null = null;
let pathRefreshDisposables: IDisposable[] = [];
let pathDecorationTimer: number | undefined;
let pathCopiedTimer: number | undefined;
let terminalContextMenuHandler: ((event: MouseEvent) => void) | null = null;
let sessionBootstrap: Promise<void> | null = null;
let disposed = false;
let bootstrapGeneration = 0;
let bootstrappingSessionId: string | null = null;
let sshExitFallbackTimer: number | undefined;
const pendingBootstrapInput: string[] = [];
const PROMPT_KICK_DELAY_MS = 400;
const SPAWN_TIMEOUT_MS = 9000;
let promptKickTimer: number | undefined;
let hasReceivedTerminalOutput = false;
let bootstrapAwaitingLayout = false;

function pathsInteractiveEnabled(): boolean {
  return shouldEnableTerminalPathInteractions(tuiModeActive.value);
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
    await writeClipboardText(path);
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

function isPromptPathLine(text: string): boolean {
  return /^(?:PS\s+)?[A-Za-z]:\\[^>\r\n]*>\s*/.test(text);
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
    if (isPromptPathLine(text)) continue;
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
            const action = resolveTerminalLinkCtrlClickAction(event, linkText);
            if (action === "open-url") {
              event.preventDefault();
              void openUrl(linkText);
              return;
            }
            if (action === "append-to-prompt") {
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
      await writeClipboardText(selection);
    } catch {
      // Clipboard may be unavailable.
    }
  }
  closePathMenu();
}

async function pasteText() {
  await handleClipboardPaste();
  closePathMenu();
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\r/g, "");
}

function resolvePaneTheme() {
  return resolveTerminalTheme(props.themeId ?? appearanceState.value.activeThemeId, appearanceState.value.customThemes);
}

function syncPaneTheme() {
  const theme = resolvePaneTheme();
  applyTerminalThemeCssVars(theme);
  if (terminal) {
    terminal.options.theme = theme.xterm;
  }
  blockRenderer?.setTheme(theme);
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

function getAutocompleteDraft(): string {
  return resolveTerminalAutocompleteInput(terminal, draftInput.value);
}

function resolveEnterCommandLine(isEnter: boolean): string {
  if (!isEnter) return "";

  const commandLine = getActiveDraft();
  if (normalizeSubmittedCommand(commandLine)) return commandLine;

  const fromBuffer = terminal ? readTerminalCurrentInput(terminal).trim() : "";
  if (fromBuffer) return fromBuffer;

  return lastNonEmptyDraft.value.trim();
}

function rememberDraftInput(data: string) {
  draftInput.value = applyTerminalInputDraft(draftInput.value, data);
  if (draftInput.value.trim()) {
    lastNonEmptyDraft.value = draftInput.value;
  }
  blockRenderer?.notifyDraftInputChanged(draftInput.value);
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

  if (getAutocompleteDraft().trim().length < 2) {
    clearSuggestion();
    return;
  }

  suggestionTimer = window.setTimeout(() => {
    const draft = getAutocompleteDraft().trim();
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
    if (requestId !== suggestionRequestId || draft !== getAutocompleteDraft().trim()) return;
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
  const draft = getAutocompleteDraft();
  const toWrite = line.startsWith(draft) ? line.slice(draft.length) : line;
  if (!toWrite) return;
  await writeSession(localSessionId.value, toWrite);
  draftInput.value = line.startsWith(draft) ? line : draft + toWrite;
  clearSuggestion();
}

function isTerminalBufferEmpty(): boolean {
  if (!terminal) return true;
  const buffer = terminal.buffer.active;
  if (buffer.length === 0) return true;
  for (let i = 0; i < buffer.length; i += 1) {
    const line = buffer.getLine(i);
    if (line && line.translateToString(true).trim().length > 0) {
      return false;
    }
  }
  return true;
}

function getTerminalPreviewText(lines = 24): string | null {
  if (!terminal || !bootstrapComplete.value) return null;
  const buffer = terminal.buffer.active;
  
  // Show up to the last `lines` from the bottom of the screen (cursorY)
  // Or just the last N lines of the buffer
  const endLine = buffer.length;
  const startLine = Math.max(0, endLine - lines);
  
  const out = [];
  for (let i = startLine; i < endLine; i++) {
    const line = buffer.getLine(i);
    if (line) out.push(line.translateToString(true));
  }
  return out.join("\n").replace(/\s+$/, "");
}

function cancelPromptKick() {
  window.clearTimeout(promptKickTimer);
  promptKickTimer = undefined;
}

function schedulePromptKick(sessionId: string) {
  cancelPromptKick();
  hasReceivedTerminalOutput = false;
  promptKickTimer = window.setTimeout(() => {
    promptKickTimer = undefined;
    if (disposed || localSessionId.value !== sessionId || !terminal) return;
    if (hasReceivedTerminalOutput || !isTerminalBufferEmpty()) return;
    void writeSession(sessionId, "\r");
  }, PROMPT_KICK_DELAY_MS);
}

function isBootstrapBlocked(): boolean {
  return shouldBlockBootstrap({
    launchError: launchError.value,
    awaitingReady: bootstrapAwaitingLayout,
  });
}

function terminalEventListenersReady(): boolean {
  return areTerminalEventListenersReady({
    outputListenerReady: Boolean(unlistenOutput),
    exitListenerReady: Boolean(unlistenExit),
  });
}

function bootstrapReadyAfterListenerSetup(): boolean {
  return shouldBootstrapTerminalAfterListenerSetup({
    tabActive: props.tabActive,
    outputListenerReady: Boolean(unlistenOutput),
    exitListenerReady: Boolean(unlistenExit),
  });
}

function retryBootstrapAfterListenersReady() {
  void setupTerminalEventListeners().then(() => {
    if (
      disposed ||
      !bootstrapReadyAfterListenerSetup() ||
      localSessionId.value ||
      sessionBootstrap ||
      sessionEndedLocally.value
    ) {
      return;
    }
    void bootstrapSession();
  });
}

function maybeRetryBootstrapWhenReady() {
  if (
    disposed ||
    !props.tabActive ||
    localSessionId.value ||
    sessionBootstrap ||
    sessionEndedLocally.value
  ) {
    return;
  }
  if (isBootstrapBlocked()) return;
  if (!terminalEventListenersReady()) {
    retryBootstrapAfterListenersReady();
    return;
  }

  if (!terminal) {
    if (!containerRef.value) return;
    void mountTerminalWithRetry();
    return;
  }

  if (!fitAddon) return;
  fitAddon.fit();
  if (!isValidPtySize(terminal.cols, terminal.rows)) {
    bootstrapAwaitingLayout = true;
    return;
  }
  bootstrapAwaitingLayout = false;
  launchError.value = null;
  void bootstrapSession();
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
      bootstrapComplete.value = true;
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
    isBootstrapBlocked() ||
    !terminal ||
    !fitAddon
  ) {
    return;
  }
  if (!terminalEventListenersReady()) {
    retryBootstrapAfterListenersReady();
    return;
  }
  if (sessionBootstrap) return sessionBootstrap;

  sessionBootstrap = (async () => {
    const generation = bootstrapGeneration;
    try {
      if (disposed || generation !== bootstrapGeneration) return;
      bootstrapComplete.value = false;
      launchError.value = null;
      await nextTick();
      fitAddon!.fit();
      if (isSshSession.value) {
        await ensureSshSession();
        if (localSessionId.value) {
          bootstrapComplete.value = true;
        }
      } else {
        const cwd =
          props.initialCwd && props.initialCwd !== "~" ? props.initialCwd : undefined;
        let layoutWaitFrames = 0;
        while (
          !disposed &&
          generation === bootstrapGeneration &&
          props.tabActive &&
          !localSessionId.value
        ) {
          fitAddon!.fit();
          if (!isValidPtySize(terminal!.cols, terminal!.rows)) {
            layoutWaitFrames += 1;
            if (layoutWaitFrames >= PTY_LAYOUT_WAIT_MAX_FRAMES) {
              bootstrapAwaitingLayout = true;
              launchError.value = "Terminal layout not ready";
              break;
            }
            await new Promise<void>((resolve) => {
              requestAnimationFrame(() => resolve());
            });
            continue;
          }
          layoutWaitFrames = 0;
          bootstrapAwaitingLayout = false;
          let sessionId: string;
          try {
            sessionId = await spawnTerminalWithTimeout(
              props.shellId,
              terminal!.cols,
              terminal!.rows,
              cwd,
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            launchError.value = message;
            if (message.includes("timed out")) {
              bootstrapAwaitingLayout = true;
            }
            break;
          }
          if (disposed || generation !== bootstrapGeneration) {
            bootstrappingSessionId = null;
            await killBootstrapSession(sessionId);
            break;
          }
          notifySessionBootstrapping(sessionId);
          launchError.value = null;
          if (disposed || generation !== bootstrapGeneration) {
            bootstrappingSessionId = null;
            await killBootstrapSession(sessionId);
            break;
          }
          bindSessionId(sessionId);
          await replayPendingOutput(sessionId);
          bootstrapComplete.value = true;
          emit("sessionCreated", props.paneId, sessionId);
          schedulePromptKick(sessionId);
          break;
        }
      }
      await flushPendingBootstrapInput();
    } catch (err) {
      pendingBootstrapInput.length = 0;
      bootstrappingSessionId = null;
      bootstrapComplete.value = false;
      bootstrapAwaitingLayout = false;
      const message = err instanceof Error ? err.message : String(err);
      launchError.value = message;
      terminal?.writeln(`\r\n[launch failed] ${message}`);
    } finally {
      sessionBootstrap = null;
      const shouldRetry =
        !disposed &&
        props.tabActive &&
        generation === bootstrapGeneration &&
        !localSessionId.value &&
        !sessionEndedLocally.value &&
        !isBootstrapBlocked();
      if (shouldRetry) {
        void bootstrapSession();
      }
    }
  })();

  return sessionBootstrap;
}

function trackCwd(data: string) {
  if (looksLikeTuiTransition(data)) {
    tuiModeActive.value = true;
    clearPathDecorations();
    blockRenderer?.setAlternateBuffer(true);
    void syncActiveAgentFromProcess();
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

  let completedAgentId: CliAgentId | null = null;
  if (next.activeAgentId !== activeAgentId.value) {
    if (activeAgentId.value && !next.activeAgentId) {
      completedAgentId = activeAgentId.value;
      markAgentCleanExitPending();
      scheduleAgentResyncAfterClear();
    }
    if (next.activeAgentId) {
      clearAgentCleanExitPending();
    }
    setActiveAgent(next.activeAgentId);
  }
  agentExitConfirmPending.value = next.agentExitConfirmPending;

  if (!next.trailingPrompt) return;
  if (next.activeAgentId) return;
  if (!isPlausiblePromptCwd(next.trailingPrompt.cwd)) return;

  tuiModeActive.value = false;
  blockRenderer?.setAlternateBuffer(false);
  blockRenderer?.setPaneCwd(next.trailingPrompt.cwd);
  blockRenderer?.finalizeOnPromptReady();
  paneCwd.value = next.trailingPrompt.cwd;
  finalizeExchange();
  promptScanBuffer = "";
  emit("cwdChanged", props.paneId, next.trailingPrompt.cwd);
  const ctx = notificationContext();
  if (shouldMarkUnseenFromPrompt(ctx, completedAgentId)) {
    emit("notificationReceived", props.paneId, completedAgentId);
    awaitingOutputSinceFocus.value = false;
  }
  emit("promptReady", props.paneId);
  updateAgentStatus();
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
  const command =
    normalizeSubmittedCommand(preferredLine) ||
    fromPending ||
    normalizeSubmittedCommand(lastNonEmptyDraft.value);
  if (!isRecordableCommand(command)) {
    return;
  }

  const agentId = detectCliAgent(command);
  if (agentId) {
    setActiveAgent(agentId);
  }
  if (isAgentExitCommand(command)) {
    const wasAgent = Boolean(activeAgentId.value);
    clearPendingAgentExitMarker();
    setActiveAgent(null);
    agentExitConfirmPending.value = false;
    promptClearSuppressUntil.value = 0;
    if (wasAgent) {
      markAgentCleanExitPending();
    }
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
  if (!isSshSession.value) {
    blockRenderer?.noteSubmittedCommand(command);
  }
  clearSuggestion();
  emit("commandSubmitted", command);
}

async function forwardTerminalInput(data: string) {
  if (disposed) return;

  const isEnter = /[\r\n]/.test(data);
  const commandLine = resolveEnterCommandLine(isEnter);

  rememberDraftInput(data);
  if (lastSubmittedCommand && draftInput.value.trim().length > 0) {
    finalizeExchange();
    promptScanBuffer = "";
  }
  maybeRecordCommand(data, commandLine);
  scheduleSuggestion();

  const payload = maybeAugmentEnterPayload(data, commandLine);

  if (localSessionId.value) {
    await writeSession(localSessionId.value, payload);
    if (isEnter && !isSshSession.value) {
      void syncActiveAgentFromProcess();
    }
    return;
  }
  if (launchError.value && !bootstrapAwaitingLayout) return;

  pendingBootstrapInput.push(payload);
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

  const ctrlDPayload = getCtrlDEofPayload(event)
    ? resolveCtrlDTerminalPayload(agentExitConfirmPending.value)
    : null;
  const ptyPayload =
    ctrlDPayload ??
    getMultilineEnterPayload(event) ??
    getCtrlBackspaceWordDeletePayload(event);
  if (!ptyPayload) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (ctrlDPayload) {
    agentExitConfirmPending.value = false;
  }
  void forwardTerminalInput(ptyPayload);
  terminal?.focus();
}

function isAgentComposerEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest(".agent-composer"));
}

function isInputLikeEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable) ||
    target.closest("input, textarea, [contenteditable='true']") !== null
  );
}

let clipboardPasteInFlight = false;
let consumeTerminalPaste = false;

type ClipboardPasteOptions = {
  fromShortcut?: boolean;
  geminiAltPaste?: boolean;
};

function shouldUseAgentNativePaste(): boolean {
  return Boolean(
    activeAgentId.value && localSessionId.value && !agentComposerOpen.value,
  );
}

async function pasteClipboardText(): Promise<boolean> {
  try {
    const text = await readClipboardText();
    if (!text) return false;
    await forwardTerminalInput(text);
    return true;
  } catch {
    return false;
  }
}

async function injectClipboardImagePaths(paths: string[]): Promise<void> {
  if (!localSessionId.value || !activeAgentId.value || paths.length === 0) return;

  if (agentComposerOpen.value) {
    agentComposerRef.value?.addAttachmentPaths(paths);
    await agentComposerRef.value?.focusComposer();
    pushAppToast("Image attached", "info");
    return;
  }

  for (const path of paths) {
    await insertAgentPromptText(
      localSessionId.value,
      activeAgentId.value,
      path,
      writeSession,
    );
  }
  pushAppToast("Image pasted into agent prompt", "info");
  terminal?.focus();
}

async function pasteGeminiClipboardImageToPrompt(): Promise<boolean> {
  if (!localSessionId.value) return false;

  const projectRoot = paneCwd.value.trim() || "~";
  const saved = await saveGeminiClipboardImage(projectRoot);
  if (!saved?.promptReference) {
    pushAppToast("Could not read clipboard image", "warning");
    return true;
  }

  await insertAgentPromptText(
    localSessionId.value,
    "gemini",
    saved.promptReference,
    writeSession,
  );
  terminal?.focus();
  return true;
}

async function handleAgentNativePaste(options?: ClipboardPasteOptions): Promise<boolean> {
  if (!shouldUseAgentNativePaste() || !localSessionId.value || !activeAgentId.value) {
    return false;
  }

  if (
    activeAgentId.value === "gemini" &&
    (options?.geminiAltPaste || (await clipboardHasPasteableImage()))
  ) {
    return pasteGeminiClipboardImageToPrompt();
  }

  if (await clipboardHasPasteableImage()) {
    const fallbackPath = await readNativeClipboardImagePath();
    if (fallbackPath && isMediaAttachmentPath(fallbackPath)) {
      await injectClipboardImagePaths([fallbackPath]);
      return true;
    }
    pushAppToast("Could not read clipboard image", "warning");
    return true;
  }

  try {
    const text = await readClipboardText();
    if (!text) return false;
    await insertAgentPromptText(
      localSessionId.value,
      activeAgentId.value,
      text,
      writeSession,
    );
    return true;
  } catch {
    return false;
  }
}

async function handleClipboardPaste(
  event?: ClipboardEvent,
  options?: ClipboardPasteOptions,
): Promise<boolean> {
  if (!props.active) return false;
  if (event?.target && (isAgentComposerEventTarget(event.target) || isInputLikeEventTarget(event.target))) return false;

  const agentNativePaste = shouldUseAgentNativePaste();
  const shouldConsume =
    consumeTerminalPaste || agentNativePaste || Boolean(options?.fromShortcut);

  if (shouldConsume && event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  if (clipboardPasteInFlight) {
    return shouldConsume;
  }

  clipboardPasteInFlight = true;
  try {
    const imageOnClipboard = await clipboardHasPasteableImage(event?.clipboardData ?? null);

    if (
      agentNativePaste &&
      imageOnClipboard &&
      activeAgentId.value === "gemini" &&
      localSessionId.value
    ) {
      return pasteGeminiClipboardImageToPrompt();
    }

    const paths = await readClipboardImagePaths({
      clipboardData: event?.clipboardData ?? null,
      destination: agentComposerOpen.value ? "composer" : "native",
    });

    if (paths.length > 0 && activeAgentId.value && localSessionId.value) {
      if (agentNativePaste && activeAgentId.value === "gemini") {
        return pasteGeminiClipboardImageToPrompt();
      }
      await injectClipboardImagePaths(paths);
      return true;
    }

    if (agentNativePaste) {
      return handleAgentNativePaste(options);
    }

    if (event) return false;

    return pasteClipboardText();
  } finally {
    clipboardPasteInFlight = false;
    consumeTerminalPaste = false;
  }
}

function isTerminalPasteShortcut(event: KeyboardEvent): boolean {
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  return (
    (isMac &&
      event.metaKey &&
      event.key.toLowerCase() === "v" &&
      !event.ctrlKey &&
      !event.altKey) ||
    (!isMac &&
      event.ctrlKey &&
      event.key.toLowerCase() === "v" &&
      !event.metaKey &&
      !event.altKey)
  );
}

function isGeminiImagePasteShortcut(event: KeyboardEvent): boolean {
  return (
    activeAgentId.value === "gemini" &&
    event.altKey &&
    event.key.toLowerCase() === "v" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

async function onWindowPasteCapture(event: ClipboardEvent) {
  if (!props.active) return;
  if (isAgentComposerEventTarget(event.target) || isInputLikeEventTarget(event.target)) return;
  if (consumeTerminalPaste || shouldUseAgentNativePaste()) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  await handleClipboardPaste(event);
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
  if (!props.tabActive) return;
  if (!terminal || !fitAddon) {
    maybeRetryBootstrapWhenReady();
    return;
  }
  fitAddon.fit();
  maybeRetryBootstrapWhenReady();
  if (!localSessionId.value) return;
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
    allowProposedApi: true,
    theme: resolvePaneTheme().xterm,
  });

  if (!isSshSession.value) {
    blockRenderer = new TerminalBlockRenderer(terminal, resolvePaneTheme(), {
      enabled: true,
      shellId: props.shellId,
    });
    blockRenderer.register();
  }
  syncPaneTheme();

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(containerRef.value);
  blockRenderer?.installOverlay(containerRef.value);
  fitAddon.fit();
  terminal.focus();
  registerPathLinkProvider();
  pathRefreshDisposables.push(
    terminal.onWriteParsed(() => {
      schedulePathDecorations();
      updateScrollToBottomVisibility();
    }),
    terminal.onScroll(() => {
      schedulePathDecorations();
      updateScrollToBottomVisibility();
    }),
    terminal.onResize(() => {
      schedulePathDecorations();
      updateScrollToBottomVisibility();
    }),
  );
  if (terminal.element) {
    terminalContextMenuHandler = onTerminalContextMenu;
    terminal.element.addEventListener("contextmenu", terminalContextMenuHandler);
  }

  terminal.onTitleChange((title) => {
    const normalized = title.trim() || null;
    localOscTitle.value = normalized;
    emit("oscTitleChanged", props.paneId, normalized);
    updateAgentStatus();
  });

  terminal.onBell(() => {
    emitNotificationIfNeeded(shouldMarkUnseenFromExplicitSignal);
  });

  terminal.attachCustomKeyEventHandler((event) => {
    const wordDeletePayload = getCtrlBackspaceWordDeletePayload(event);
    if (wordDeletePayload) {
      event.preventDefault();
      return false;
    }

    const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

    // Copy shortcut (Ctrl+C / Cmd+C when selection exists)
    const isCopy = (isMac && event.metaKey && event.key.toLowerCase() === "c" && !event.ctrlKey && !event.altKey) ||
                   (!isMac && event.ctrlKey && event.key.toLowerCase() === "c" && !event.metaKey && !event.altKey);
    if (isCopy && terminal && terminal.hasSelection()) {
      if (event.type === "keydown") {
        void writeClipboardText(terminal.getSelection()).catch(() => {});
      }
      event.preventDefault();
      return false;
    }

    if (terminal && isGeminiImagePasteShortcut(event)) {
      if (event.type === "keydown") {
        consumeTerminalPaste = true;
        void handleClipboardPaste(undefined, { fromShortcut: true, geminiAltPaste: true });
      }
      event.preventDefault();
      return false;
    }

    if (terminal && isTerminalPasteShortcut(event)) {
      if (event.type === "keydown") {
        consumeTerminalPaste = true;
        void handleClipboardPaste(undefined, { fromShortcut: true });
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

  resizeObserver = new ResizeObserver(() => {
    void handleResize();
  });
  resizeObserver.observe(containerRef.value);

  await setupTerminalEventListeners();

  if (bootstrapReadyAfterListenerSetup()) {
    void bootstrapSession();
  }
}

async function setupTerminalEventListeners() {
  if (unlistenOutput && unlistenExit) return;
  if (eventListenersSetup) return eventListenersSetup;

  eventListenersSetup = (async () => {
    const [outputListener, exitListener] = await Promise.all([
      listen<TerminalOutputEvent>("terminal-output", (event) => {
        if (event.payload.sessionId !== activeOutputSessionId() || !terminal) return;
        hasReceivedTerminalOutput = true;
        cancelPromptKick();
        if (sshStartupSnippetPending) {
          const snippet = sshStartupSnippetPending;
          sshStartupSnippetPending = null;
          void writeSession(event.payload.sessionId, `${snippet}\r`);
        }
        if (capturingResponse) responseBuffer += event.payload.data;
        writeTerminalOutput(prepareTerminalOutput(event.payload.data));
      }),
      listen<TerminalExitEvent>("terminal-exit", (event) => {
        if (disposed) return;
        if (intentionallyKilledSessions.has(event.payload.sessionId)) {
          intentionallyKilledSessions.delete(event.payload.sessionId);
          return;
        }
        const activeSessionId =
          backendSessionId.value ?? localSessionId.value ?? bootstrappingSessionId;
        if (event.payload.sessionId !== activeSessionId || !terminal) return;

        disposed = true;
        sessionEndedLocally.value = true;
        bootstrapGeneration += 1;
        pendingBootstrapInput.length = 0;
        window.clearTimeout(sshExitFallbackTimer);
        clearPendingAgentExitMarker();
        const endedAgentId = activeAgentId.value;
        if (endedAgentId) {
          notifyAgentEnded(props.paneId, endedAgentId, "session_ended", {
            exitCode: event.payload.exitCode,
          });
        }
        resetAgentStatusTracking();
        setActiveAgent(null);
        agentExitConfirmPending.value = false;
        promptClearSuppressUntil.value = 0;
        tuiModeActive.value = false;
        clearPathDecorations();
        localSessionId.value = null;
        backendSessionId.value = null;
        bootstrappingSessionId = null;
        bootstrapComplete.value = false;
        void killBackendSessionIfPresent(event.payload.sessionId);
        emit("oscTitleChanged", props.paneId, null);
        emit("sessionEnded", props.paneId);
      }),
    ]);

    if (disposed) {
      outputListener();
      exitListener();
      return;
    }

    unlistenOutput = outputListener;
    unlistenExit = exitListener;
  })().finally(() => {
    eventListenersSetup = null;
  });

  return eventListenersSetup;
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
  clearPendingAgentExitMarker();
  if (isSshSession.value) {
    clearPendingSshTerminalLaunch(props.paneId);
    sshStartupSnippetPending = null;
  }
  pendingBootstrapInput.length = 0;
  bootstrapComplete.value = false;
  bootstrappingSessionId = null;
  bootstrapAwaitingLayout = false;
  cancelPromptKick();
  await waitForBootstrapAbort();
  const sessionId = resolveSessionIdToKill();
  localSessionId.value = null;
  backendSessionId.value = null;
  await killBackendSessionIfPresent(sessionId);
  emit("oscTitleChanged", props.paneId, null);
  if (sessionId) {
    emit("sessionReleased", props.paneId);
  }
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

async function insertText(text: string) {
  if (agentComposerOpen.value && agentComposerRef.value) {
    agentComposerRef.value.insertText(text);
    await agentComposerRef.value.focusComposer();
  } else {
    await appendToPrompt(text);
  }
}

defineExpose({
  focusTerminal,
  toggleAgentComposer,
  openAgentComposer,
  closeAgentComposer,
  isAgentComposerOpen: () => agentComposerOpen.value,
  getTerminalPreviewText,
  killSession,
  getBackendSessionId,
  insertText,
});

onMounted(async () => {
  disposed = false;
  localSessionId.value = null;
  backendSessionId.value = null;
  bootstrapComplete.value = false;
  bootstrapAwaitingLayout = false;
  launchError.value = null;
  bootstrappingSessionId = null;
  if (props.sessionId) {
    await killBackendSessionIfPresent(props.sessionId);
    emit("sessionReleased", props.paneId);
  }
  await nextTick();
  window.addEventListener("keydown", onWindowKeyCapture, true);
  window.addEventListener("paste", onWindowPasteCapture, true);

  void (async () => {
    try {
      const scaleFactor = await getCurrentWindow().scaleFactor();
      unlistenDragDrop = await getCurrentWebview().onDragDropEvent((event) => {
        if (!props.active || !props.tabActive) {
          isDraggingOverThisPane.value = false;
          return;
        }
        if (event.payload.type === "over") {
          if (!containerRef.value) return;
          const pos = event.payload.position.toLogical(scaleFactor);
          const rect = containerRef.value.getBoundingClientRect();
          const inBounds = rect.width > 0 && rect.height > 0 && pos.x >= rect.left && pos.x <= rect.right && pos.y >= rect.top && pos.y <= rect.bottom;
          isDraggingOverThisPane.value = inBounds;
          return;
        }
        if (event.payload.type === "leave") {
          isDraggingOverThisPane.value = false;
          return;
        }
        if (event.payload.type === "drop") {
          isDraggingOverThisPane.value = false;
          if (!containerRef.value) return;
          const pos = event.payload.position.toLogical(scaleFactor);
          const rect = containerRef.value.getBoundingClientRect();
          const inBounds = rect.width > 0 && rect.height > 0 && pos.x >= rect.left && pos.x <= rect.right && pos.y >= rect.top && pos.y <= rect.bottom;
          if (inBounds && event.payload.paths.length > 0) {
            const textToInsert = event.payload.paths.map(p => {
              return p.includes(" ") ? `"${p}"` : p;
            }).join(" ");
            void forwardTerminalInput(textToInsert);
          }
        }
      });
    } catch {
      // Drag-drop is optional outside the Tauri webview.
    }
  })();

  await mountTerminalWithRetry();
});

async function mountTerminalWithRetry(attempt = 0): Promise<boolean> {
  await nextTick();
  if (!containerRef.value) {
    if (attempt < MOUNT_CONTAINER_WAIT_MAX_FRAMES) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      return mountTerminalWithRetry(attempt + 1);
    }
    bootstrapAwaitingLayout = true;
    launchError.value = "Terminal container not ready";
    return false;
  }
  if (terminal) return true;
  bootstrapAwaitingLayout = false;
  launchError.value = null;
  await mountTerminal();
  return true;
}

watch(
  () => [props.active, props.tabActive] as const,
  ([active, tabActive]) => {
    if (active && tabActive) {
      awaitingOutputSinceFocus.value = false;
      window.clearTimeout(outputNotifyTimer);
      void scheduleTerminalFocus();
      void handleResize();
      scheduleSuggestion();
      if (!localSessionId.value && !sessionEndedLocally.value) {
        maybeRetryBootstrapWhenReady();
      }
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
      !disposed &&
      !sessionEndedLocally.value &&
      !localSessionId.value &&
      !isBootstrapBlocked()
    ) {
      maybeRetryBootstrapWhenReady();
    }
  },
);

watch(containerRef, (element) => {
  if (
    element &&
    !terminal &&
    props.tabActive &&
    !disposed &&
    !localSessionId.value &&
    !sessionEndedLocally.value
  ) {
    void mountTerminalWithRetry();
  }
});

watch(
  () => props.shellId,
  async (shellId, previous) => {
    if (shellId === previous || !terminal || isSshSession.value) return;
    blockRenderer?.setShellId(shellId);
    launchError.value = null;
    bootstrapAwaitingLayout = false;
    pendingBootstrapInput.length = 0;
    sessionEndedLocally.value = false;
    await shutdownSession(false, { markEndedLocally: false });
    disposed = false;
    bootstrapGeneration += 1;
    await bootstrapSession();
  },
);

onBeforeUnmount(async () => {
  disposed = true;
  unlistenDragDrop?.();
  window.removeEventListener("keydown", onWindowKeyCapture, true);
  window.removeEventListener("paste", onWindowPasteCapture, true);
  window.clearTimeout(resizeTimer);
  window.clearTimeout(suggestionTimer);
  window.clearTimeout(outputNotifyTimer);
  window.clearTimeout(recentOutputTimer);
  window.clearTimeout(pathDecorationTimer);
  window.clearTimeout(pathCopiedTimer);
  window.clearTimeout(agentCleanExitTimer);
  window.clearTimeout(agentResyncTimer);
  agentResyncRequestId += 1;
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
  blockRenderer?.dispose();
  blockRenderer = null;
  await eventListenersSetup?.catch(() => {});
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

const currentTheme = computed(() => resolvePaneTheme());
const terminalBgStyle = computed(() => {
  const bg = currentTheme.value.xterm.background;
  if (!bg || bg === "transparent") {
    return { backgroundColor: "#000000" };
  }
  return { backgroundColor: bg };
});

watch(
  () => [props.themeId, appearanceState.value.activeThemeId, appearanceState.value.customThemes] as const,
  () => {
    syncPaneTheme();
  },
  { deep: true },
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
  () => canSuggest() && Boolean(suggestion.value) && getAutocompleteDraft().trim().length >= 2,
);

const suggestionStripVisible = computed(
  () =>
    suggestionVisible.value ||
    (suggestionLoading.value && canSuggest() && getAutocompleteDraft().trim().length >= 2),
);

watch(suggestionStripVisible, () => {
  void nextTick(() => handleResize());
});
</script>

<template>
  <div
    class="terminal-pane relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    :class="active ? 'terminal-pane--active' : ''"
    @mousedown="emit('focusPane')"
  >
    <!-- Chat View GUI Container -->
    <div v-if="chatViewOpen" class="flex flex-1 flex-col min-h-0 w-full bg-[var(--oterm-bg)]">
      <ChatView />
    </div>

    <!-- Standard Terminal Layout Container -->
    <div v-show="!chatViewOpen" class="flex-1 min-h-0 w-full px-2 py-1">
      <div
        class="terminal-window-container flex flex-col h-full w-full rounded-lg overflow-hidden p-3 transition-all"
        :class="[
          active ? 'terminal-window-container--active' : '',
          isDraggingOverThisPane ? '!border-[var(--oterm-accent)]/55 ring-1 ring-[var(--oterm-accent)]/20 bg-white/[0.01]' : ''
        ]"
        :style="terminalBgStyle"
      >
        <div ref="containerRef" class="terminal-output min-h-0 w-full flex-1" />
        <button
          v-if="showScrollToBottom"
          type="button"
          class="absolute bottom-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-md glass-panel btn-premium text-[var(--oterm-text)] shadow-lg"
          aria-label="Scroll to bottom"
          @mousedown.stop
          @click="scrollTerminalToBottom"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="8" y1="2" x2="8" y2="11" />
            <polyline points="4 7 8 11 12 7" />
            <line x1="3" y1="14" x2="13" y2="14" />
          </svg>
        </button>
      </div>
    </div>
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
      v-if="suggestionStripVisible && !chatViewOpen"
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
      class="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-elevated)] px-3 py-1.5 text-xs text-[var(--oterm-text)] shadow-lg"
    >
      Path copied
    </div>
  </div>
</template>
