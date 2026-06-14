<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type ComponentPublicInstance,
} from "vue";
import HistorySearch from "./components/HistorySearch.vue";
import SessionHeader from "./components/SessionHeader.vue";
import SidebarRail from "./components/SidebarRail.vue";
import SourceControlPanel from "./components/SourceControlPanel.vue";
import StatusBar from "./components/StatusBar.vue";
import TerminalPane from "./components/TerminalPane.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";
import SshSecretPrompt from "./components/ssh/SshSecretPrompt.vue";
import BranchManagerView from "./components/BranchManagerView.vue";
import DockerManagerView from "./components/DockerManagerView.vue";
import SshSftpManagerView from "./components/SshSftpManagerView.vue";
import CreatePullRequestDialog from "./components/CreatePullRequestDialog.vue";
import PullRequestsView from "./components/PullRequestsView.vue";
import IssuesView from "./components/IssuesView.vue";
import SettingsView from "./components/SettingsView.vue";
import TitleBar from "./components/TitleBar.vue";
import TooltipLayer from "./components/TooltipLayer.vue";
import AppToastLayer from "./components/AppToastLayer.vue";
import ToolsPanel from "./components/ToolsPanel.vue";
import { useActiveBranchPr } from "./composables/useActiveBranchPr";
import { useResizablePanel } from "./composables/useResizablePanel";
import { useSourceControl } from "./composables/useSourceControl";
import { useTerminalHistory } from "./composables/useTerminalHistory";
import { useWorkspace } from "./composables/useWorkspace";
import { useWorkspacePersistence } from "./composables/useWorkspacePersistence";
import type {
  ClosedTerminalSession,
  SaveProfileDraft,
  WorkspacePane,
  WorkspaceTerminalTab,
} from "./types/terminal";
import { isTerminalTab } from "./types/terminal";
import {
  DEFAULT_SHELL_SETTING_KEY,
  loadDefaultShellId,
  saveDefaultShellId,
} from "./lib/shellSettings";
import { getSetting, setSetting } from "./lib/settingsStore";
import { loadPersistedTerminalWorkspace } from "./lib/workspaceStore";
import type { DockerContainer } from "./types/docker";
import type { SshEndpoint } from "./types/sshSftp";
import { loadSshSftpLibrary, saveSshSftpLibrary } from "./lib/sshSftpStore";
import {
  buildSshConnectRequest,
  resolveConnectSecrets,
  networkHopIntegratedConnectError,
  usesNativeSshTerminal,
  type SshSecretKind,
} from "./lib/sshConnectSecrets";
import {
  clearPendingSshTerminalLaunch,
  setPendingSshTerminalLaunch,
} from "./lib/sshTerminalLaunch";
import { sshTerminalKill, sshTerminalKillAll, sshTerminalWrite } from "./lib/sshTerminalApi";
import { buildTerminalLaunchCommand, terminalTabTitle } from "./lib/sshOpenSshArgs";
import { saveHostPassword, saveIdentityPassphrase } from "./lib/sshCredentialStore";
import type { SshConnectError } from "./types/sshSftp";
import { getLaunchInitialCwd } from "./lib/launchApi";
import {
  getDefaultShellId,
  killAllTerminals,
  killTerminal,
  listShells,
  listenTerminalAgentChanged,
  listenTerminalProcessChanged,
  writeTerminal,
} from "./lib/terminalApi";
import type { CliAgentId } from "./lib/terminalAgentMode";
import { consumeAppShortcut, isTabCycleShortcut } from "./lib/appKeyboardShortcuts";
import {
  canOfferCreatePrLocally,
  defaultCreatePrTitle,
  hasOpenPrForHead,
  initCreatePrBranches,
  isGithubPrCapable,
} from "./lib/createPrFlow";
import { createPullRequest, detectPrProvider, listPullRequests } from "./lib/pullRequestApi";
import { shouldSuppressReadyNotification } from "./lib/agentLifecycle";
import {
  buildTerminalNotificationContent,
  sendTerminalSystemNotification,
} from "./lib/systemNotification";
import { shellLabelFor } from "./lib/sidebarEntries";
import { formatGitOperationError } from "./lib/formatGitError";
import { pushAppToast } from "./lib/appToast";
import { listGitWorktrees } from "./lib/gitApi";
import { resolveActiveWorktree, resolveGitMutationRoot, switchGitBranch } from "./lib/switchGitBranch";
import type { GitWorktreeInfo } from "./types/git";

import { getVersion } from "@tauri-apps/api/app";

const appVersion = ref("0.1.1");

const systemDefaultShellId = ref("cmd");
const defaultShellId = ref("");
const closedSessions = ref<ClosedTerminalSession[]>([]);
const pendingTerminalCommands = new Map<string, string>();

const sshSecretOpen = ref(false);
const sshSecretTitle = ref("");
const sshSecretLabel = ref("");
const sshSecretValue = ref("");
const sshSecretSave = ref(false);
const sshSecretShowSave = ref(false);
const sshSecretSaveLabel = ref("Save in OS credential store");
const sshSecretKind = ref<SshSecretKind>("password");
const sshSecretEndpointId = ref<string | null>(null);
let sshSecretResolve: ((value: string) => void) | null = null;
let sshSecretReject: ((reason?: unknown) => void) | null = null;

const sshConfirmOpen = ref(false);
const sshConfirmTitle = ref("");
const sshConfirmMessage = ref("");
const sshConfirmLabel = ref("Confirm");
let sshConfirmResolve: ((value: boolean) => void) | null = null;
const terminalPaneThemes = ref<Record<string, string | null>>({});
const canReopenClosed = computed(() => closedSessions.value.length > 0);
const activeAgentComposerOpen = ref(false);
const terminalPaneRefs = new Map<string, InstanceType<typeof TerminalPane>>();
const closingTabIds = new Set<string>();

const SESSION_KILL_TIMEOUT_MS = 2500;

async function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  await Promise.race([
    promise,
    new Promise<void>((resolve) => window.setTimeout(resolve, ms)),
  ]);
}

async function killPaneSession(pane: WorkspacePane) {
  clearPendingSshTerminalLaunch(pane.id);
  const paneRef = terminalPaneRefs.get(pane.id);
  if (paneRef?.killSession) {
    await withTimeout(paneRef.killSession(), SESSION_KILL_TIMEOUT_MS);
  }
  const sessionId =
    pane.bootstrappingSessionId ??
    pane.sessionId ??
    paneRef?.getBackendSessionId?.() ??
    null;
  if (!sessionId) return;
  await withTimeout(
    (async () => {
      try {
        if (pane.sshEndpointId) {
          await sshTerminalKill(sessionId);
        } else {
          await killTerminal(sessionId);
        }
      } catch {
        // Session may already have been killed by the pane or backend exit handler.
      }
    })(),
    SESSION_KILL_TIMEOUT_MS,
  );
}

async function killAllTerminalSessionsForClose() {
  const panes = tabs.value.flatMap((tab) =>
    isTerminalTab(tab) ? tab.panes : [],
  );
  await Promise.all(panes.map((pane) => killPaneSession(pane)));
  await withTimeout(
    (async () => {
      try {
        await Promise.all([killAllTerminals(), sshTerminalKillAll()]);
      } catch {
        // Backend may already have torn down sessions.
      }
    })(),
    SESSION_KILL_TIMEOUT_MS,
  );
}

function bindTerminalPaneRef(paneId: string) {
  return (instance: Element | ComponentPublicInstance | null) => {
    if (instance && "toggleAgentComposer" in instance) {
      terminalPaneRefs.set(paneId, instance as InstanceType<typeof TerminalPane>);
      return;
    }
    terminalPaneRefs.delete(paneId);
  };
}

function syncActiveAgentComposerOpen() {
  const paneId = activePaneId.value;
  if (!paneId) {
    activeAgentComposerOpen.value = false;
    return;
  }
  activeAgentComposerOpen.value =
    terminalPaneRefs.get(paneId)?.isAgentComposerOpen() ?? false;
}

function onComposerOpenChanged(paneId: string, open: boolean) {
  if (paneId !== activePaneId.value) return;
  activeAgentComposerOpen.value = open;
}

function toggleActiveAgentComposer() {
  const paneId = activePaneId.value;
  if (!paneId) return;
  terminalPaneRefs.get(paneId)?.toggleAgentComposer();
}

const terminalSidebarOpen = ref(true);
const toolsOpen = ref(false);
const sourceControlOpen = ref(false);
const gitRefreshToken = ref(0);

const createPrOpen = ref(false);
const createPrBannerVisible = ref(false);
const createPrTitle = ref("");
const createPrBody = ref("");
const createPrBase = ref("");
const createPrHead = ref("");
const createPrDraft = ref(false);
const createPrBusy = ref(false);
const createPrError = ref<string | null>(null);

const {
  widthPx: sourceControlWidth,
  fileListWidthPx: sourceControlFileListWidth,
  resizing: sourceControlResizing,
  onResizeHandlePointerDown,
  onFileListResizePointerDown,
} = useResizablePanel();

const SIDEBAR_WIDTH_KEY = "oterm:sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 224;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 480;

const sidebarWidthPx = ref(DEFAULT_SIDEBAR_WIDTH);
const sidebarResizing = ref(false);

function loadSidebarWidth(): number {
  const raw = getSetting(SIDEBAR_WIDTH_KEY);
  if (!raw) return DEFAULT_SIDEBAR_WIDTH;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, parsed));
}

function onSidebarResizePointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  sidebarResizing.value = true;

  const startX = event.clientX;
  const startWidth = sidebarWidthPx.value;

  function onPointerMove(moveEvent: PointerEvent) {
    const next = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(MAX_SIDEBAR_WIDTH, startWidth + (moveEvent.clientX - startX))
    );
    if (next !== sidebarWidthPx.value) {
      sidebarWidthPx.value = next;
      window.dispatchEvent(new Event("resize"));
    }
  }

  function onPointerUp() {
    sidebarResizing.value = false;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    void setSetting(SIDEBAR_WIDTH_KEY, String(sidebarWidthPx.value));
    window.dispatchEvent(new Event("resize"));
  }

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
}

const {
  shells,
  tabs,
  terminalGroups,
  collapsedGroupIds,
  activeTabId,
  activePaneId,
  activePane,
  activeTerminalTab,
  createTab,
  openPullRequestsTab,
  openBranchManagerTab,
  openIssuesTab,
  openDockerManagerTab,
  openSshSftpTab,
  openSettingsTab,
  closeTab: removeTab,
  splitActiveTabHorizontal,
  selectTab,
  selectPane,
  setPaneSession,
  setPaneBootstrappingSession,
  clearPaneBootstrappingSession,
  clearPaneSession,
  setPaneSshEndpoint,
  setPaneCwd,
  setPaneAgent,
  setPaneProcess,
  setPaneOscTitle,
  setPaneUnseenNotification,
  setTabTitle,
  setTabColor,
  createGroup,
  renameGroup,
  deleteGroup,
  setGroupColor,
  toggleGroupCollapsed,
  moveTabToGroup,
  moveTab,
  serializeTerminalWorkspace,
  hydrateTerminalWorkspace,
} = useWorkspace(() => defaultShellId.value);

const mountedTerminalTabIds = ref(new Set<string>());

function ensureTerminalMounted(tabId: string) {
  if (mountedTerminalTabIds.value.has(tabId)) return;
  mountedTerminalTabIds.value = new Set([...mountedTerminalTabIds.value, tabId]);
}

function unmountTerminalTab(tabId: string) {
  if (!mountedTerminalTabIds.value.has(tabId)) return;
  const next = new Set(mountedTerminalTabIds.value);
  next.delete(tabId);
  mountedTerminalTabIds.value = next;
}

watch(
  activeTabId,
  (tabId) => {
    if (!tabId) return;
    const tab = tabs.value.find((item) => item.id === tabId);
    if (tab && isTerminalTab(tab)) ensureTerminalMounted(tabId);
  },
  { immediate: true },
);

useWorkspacePersistence(
  tabs,
  activeTabId,
  activePaneId,
  terminalGroups,
  collapsedGroupIds,
  serializeTerminalWorkspace,
  {
    beforeDestroy: killAllTerminalSessionsForClose,
  },
);

watch(activePaneId, () => {
  syncActiveAgentComposerOpen();
});

const history = useTerminalHistory();
const {
  open: historyOpen,
  query: historyQuery,
  addEntry,
  filteredEntries,
  openSearch,
  closeSearch,
} = history;
const filteredHistory = computed(() => filteredEntries());

const activeCwd = computed(() => activePane.value?.cwd);
const {
  status: sourceControlStatus,
  branches: gitBranches,
  history: gitHistory,
  loadedCwd: sourceControlLoadedCwd,
  graphRefreshToken: gitGraphRefreshToken,
  loading: sourceControlLoading,
  operation: sourceControlOperation,
  operationLabel: sourceControlOperationLabel,
  busy: sourceControlBusy,
  refresh: refreshSourceControl,
  stage: stageGitPaths,
  unstage: unstageGitPaths,
  revert: revertGitPaths,
  revertAll: revertAllGitChanges,
  revertHunk: revertGitHunk,
  stageHunk: stageGitHunk,
  unstageHunk: unstageGitHunk,
  commit: commitGitChanges,
  fetch: fetchGitRepo,
  pull: pullGitRepo,
  push: pushGitRepo,
  sync: syncGitRepo,
} = useSourceControl(activeCwd);

const gitBadgeStatus = computed(() => ({
  isRepo: sourceControlStatus.value.isRepo,
  branch: sourceControlStatus.value.branch,
  upstream: sourceControlStatus.value.upstream,
  ahead: sourceControlStatus.value.ahead,
  behind: sourceControlStatus.value.behind,
  changedFiles: sourceControlStatus.value.changedFiles,
  additions: sourceControlStatus.value.additions,
  deletions: sourceControlStatus.value.deletions,
}));

const activePaneGit = computed(() => {
  if (sourceControlLoadedCwd.value !== activeCwd.value) {
    return undefined;
  }
  return {
    paneId: activePaneId.value ?? "",
    branch: sourceControlStatus.value.branch,
    isRepo: sourceControlStatus.value.isRepo,
    changedFiles: sourceControlStatus.value.changedFiles,
    additions: sourceControlStatus.value.additions,
    deletions: sourceControlStatus.value.deletions,
    repoRoot: sourceControlStatus.value.repoRoot ?? null,
  };
});

let promptGitRefreshTimer: number | undefined;
const sourceControlPanelRef = ref<InstanceType<typeof SourceControlPanel> | null>(null);
const gitBranchSwitchBusy = ref(false);
const gitWorktrees = ref<GitWorktreeInfo[]>([]);

watch(
  [() => sourceControlStatus.value.repoRoot, activeCwd],
  async ([root]) => {
    if (!root) {
      gitWorktrees.value = [];
      return;
    }
    try {
      gitWorktrees.value = await listGitWorktrees(root);
    } catch {
      gitWorktrees.value = [];
    }
  },
  { immediate: true },
);

const gitWorktreeHint = computed(() => {
  const wt = resolveActiveWorktree(activeCwd.value, gitWorktrees.value);
  if (!wt || wt.isMain) return null;
  return { path: wt.path, branch: wt.branch };
});

async function refreshGitViews() {
  await refreshSourceControl();
  gitRefreshToken.value += 1;
}

function bumpGitBadges() {
  gitRefreshToken.value += 1;
}

async function runGitAction(action: () => Promise<void>) {
  await action();
  bumpGitBadges();
}

function notifyGitError(err: unknown) {
  const message = formatGitOperationError(err);
  pushAppToast(message, "error");
  sourceControlPanelRef.value?.showPanelFeedback(message, true);
}

function notifyGitInfo(message: string) {
  pushAppToast(message, "info");
  sourceControlPanelRef.value?.showPanelFeedback(message, false);
}

async function runGitActionWithFeedback(action: () => Promise<void>) {
  try {
    await runGitAction(action);
  } catch (err) {
    notifyGitError(err);
    throw err;
  }
}

function closeCreatePrDialog() {
  createPrOpen.value = false;
  createPrError.value = null;
}

function dismissCreatePrBanner() {
  createPrBannerVisible.value = false;
}

function prepareCreatePrForm() {
  const status = sourceControlStatus.value;
  const { base, head } = initCreatePrBranches(gitBranches.value, status.upstream);
  createPrHead.value = head;
  createPrBase.value = base;
  createPrTitle.value = defaultCreatePrTitle(gitHistory.value, head);
  createPrBody.value = "";
  createPrDraft.value = false;
  createPrError.value = null;
}

function openCreatePrDialog() {
  prepareCreatePrForm();
  createPrBannerVisible.value = false;
  createPrOpen.value = true;
}

async function submitCreatePr() {
  const root = gitRepoRoot.value;
  if (!root || !createPrTitle.value.trim() || !createPrBase.value || !createPrHead.value) return;
  if (createPrBase.value === createPrHead.value) {
    createPrError.value = "Base and compare branches must be different.";
    return;
  }

  createPrBusy.value = true;
  createPrError.value = null;
  try {
    await createPullRequest({
      repoRoot: root,
      title: createPrTitle.value.trim(),
      body: createPrBody.value,
      base: createPrBase.value,
      head: createPrHead.value,
      draft: createPrDraft.value,
    });
    closeCreatePrDialog();
    dismissCreatePrBanner();
    openPullRequestsTab(root);
    bumpGitBadges();
  } catch (err) {
    createPrError.value = err instanceof Error ? err.message : String(err);
  } finally {
    createPrBusy.value = false;
  }
}

async function maybeOfferCreatePrAfterPush() {
  const root = gitRepoRoot.value;
  const status = sourceControlStatus.value;
  if (!root || !canOfferCreatePrLocally(status)) return;

  try {
    const provider = await detectPrProvider(root);
    if (!isGithubPrCapable(provider)) return;

    if (provider.authOk) {
      try {
        const openPrs = await listPullRequests(root, false);
        if (hasOpenPrForHead(openPrs, status.branch!)) return;
      } catch {
        // Listing PRs failed — still offer; create may surface the real error.
      }
    }

    prepareCreatePrForm();
    if (!sourceControlOpen.value) {
      sourceControlOpen.value = true;
    }
    createPrBannerVisible.value = true;
  } catch {
    // Optional flow — ignore detection failures.
  }
}

async function onPushGit() {
  try {
    await runGitActionWithFeedback(pushGitRepo);
    await maybeOfferCreatePrAfterPush();
  } catch {
    // Error shown in source control panel.
  }
}

async function onSyncGit() {
  const hadCommitsToPush = sourceControlStatus.value.ahead > 0;
  try {
    await runGitActionWithFeedback(syncGitRepo);
    if (hadCommitsToPush) await maybeOfferCreatePrAfterPush();
  } catch {
    // Error shown in source control panel.
  }
}

async function runGitHunkAction(action: () => Promise<void>) {
  try {
    await runGitAction(action);
    notifyGitInfo("Change applied");
    sourceControlPanelRef.value?.showHunkFeedback("Change applied");
  } catch (err) {
    const message = formatGitOperationError(err);
    pushAppToast(message, "error");
    sourceControlPanelRef.value?.showHunkFeedback(message, true);
  } finally {
    sourceControlPanelRef.value?.clearHunkOperation();
  }
}

function onDiffExpandedChange() {
  void refitTerminals();
}

function onPromptReady(paneId: string) {
  if (paneId !== activePaneId.value) return;
  window.clearTimeout(promptGitRefreshTimer);
  promptGitRefreshTimer = window.setTimeout(() => {
    void refreshGitViews();
  }, 150);
}

function toggleSourceControl() {
  sourceControlOpen.value = !sourceControlOpen.value;
  void refreshGitViews();
}

const projectRoot = computed(() => {
  const cwd = activePane.value?.cwd;
  if (!cwd || cwd === "~") return "~";
  return cwd;
});

const gitRepoRoot = computed(() => sourceControlStatus.value.repoRoot ?? null);
const activeBranch = computed(() => sourceControlStatus.value.branch);
const activeWorkspaceTab = computed(
  () => tabs.value.find((tab) => tab.id === activeTabId.value) ?? null,
);
const { activePr, loading: activePrLoading } = useActiveBranchPr(
  gitRepoRoot,
  activeBranch,
  gitRefreshToken,
);
const canOpenGitFeatures = computed(() => Boolean(gitRepoRoot.value));

const sourceControlRestoreOnReturn = ref(false);

watch(
  () => sourceControlStatus.value.isRepo,
  (isRepo) => {
    if (!isRepo) {
      sourceControlOpen.value = false;
    }
  },
  { immediate: true },
);

watch(
  [() => activeWorkspaceTab.value?.kind ?? null, () => sourceControlStatus.value.isRepo],
  ([kind, isRepo], [previousKind, previousIsRepo]) => {
    if (previousKind === "terminal" && kind !== "terminal" && previousIsRepo) {
      sourceControlRestoreOnReturn.value = sourceControlOpen.value;
    }

    if (kind === "terminal" && isRepo && sourceControlRestoreOnReturn.value) {
      sourceControlOpen.value = true;
      sourceControlRestoreOnReturn.value = false;
      return;
    }

    if (!isRepo) {
      sourceControlOpen.value = false;
    }
  },
  { immediate: true },
);

function openPullRequests() {
  const root = gitRepoRoot.value;
  if (!root) return;
  openPullRequestsTab(root);
}

function openBranchManager() {
  const root = gitRepoRoot.value;
  if (!root) return;
  openBranchManagerTab(
    resolveGitMutationRoot(root, activeCwd.value, gitWorktrees.value),
  );
}

function openIssues() {
  const root = gitRepoRoot.value;
  if (!root) return;
  openIssuesTab(root);
}

function openDockerManager() {
  openDockerManagerTab();
}

function openSshSftp() {
  openSshSftpTab();
}

function openSettings() {
  openSettingsTab();
}

function findWorkspacePane(paneId: string): WorkspacePane | null {
  for (const tab of tabs.value) {
    if (!isTerminalTab(tab)) continue;
    const pane = tab.panes.find((item) => item.id === paneId);
    if (pane) return pane;
  }
  return null;
}

function askSshSecret(options: {
  kind: SshSecretKind;
  endpoint: SshEndpoint;
  title: string;
  label: string;
  defaultSave: boolean;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    sshSecretKind.value = options.kind;
    sshSecretEndpointId.value = options.endpoint.id;
    sshSecretTitle.value = options.title;
    sshSecretLabel.value = options.label;
    sshSecretValue.value = "";
    sshSecretSave.value = options.defaultSave;
    sshSecretShowSave.value = true;
    sshSecretSaveLabel.value =
      options.kind === "password"
        ? "Save password in OS credential store"
        : "Save passphrase in OS credential store";
    sshSecretResolve = resolve;
    sshSecretReject = reject;
    sshSecretOpen.value = true;
  });
}

function submitSshSecret() {
  const value = sshSecretValue.value;
  const endpointId = sshSecretEndpointId.value;
  sshSecretOpen.value = false;
  sshSecretResolve?.(value);
  sshSecretResolve = null;
  sshSecretReject = null;
  if (endpointId && sshSecretSave.value) {
    if (sshSecretKind.value === "password") {
      void saveHostPassword(endpointId, value).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        pushAppToast(`Could not save password: ${message}`, "error");
      });
      const library = loadSshSftpLibrary();
      const idx = library.endpoints.findIndex((item) => item.id === endpointId);
      if (idx >= 0) {
        library.endpoints[idx] = {
          ...library.endpoints[idx],
          auth: { ...library.endpoints[idx].auth, savePassword: true },
        };
        saveSshSftpLibrary(library);
      }
    } else if (sshSecretKind.value === "passphrase") {
      const library = loadSshSftpLibrary();
      const endpoint = library.endpoints.find((item) => item.id === endpointId);
      if (endpoint?.auth.identityId) {
        void saveIdentityPassphrase(endpoint.auth.identityId, value);
      }
    }
  }
  sshSecretEndpointId.value = null;
}

function cancelSshSecret() {
  sshSecretOpen.value = false;
  sshSecretReject?.(new Error("Cancelled"));
  sshSecretResolve = null;
  sshSecretReject = null;
  sshSecretEndpointId.value = null;
}

function askSshHostKeyTrust(endpoint: SshEndpoint, error: SshConnectError): Promise<boolean> {
  return new Promise((resolve) => {
    sshConfirmTitle.value = "Trust this host?";
    sshConfirmMessage.value = `The server ${endpoint.host}:${endpoint.port} is not in your known_hosts file.\n\n${error.algorithm}\n${error.fingerprint}\n\nOnly continue if you trust this server.`;
    sshConfirmLabel.value = "Trust and connect";
    sshConfirmResolve = resolve;
    sshConfirmOpen.value = true;
  });
}

function resolveSshConfirm(confirmed: boolean) {
  sshConfirmOpen.value = false;
  sshConfirmResolve?.(confirmed);
  sshConfirmResolve = null;
}

async function openSshTerminal(endpoint: SshEndpoint) {
  const library = loadSshSftpLibrary();
  const shellId = resolveDefaultShellId();

  if (!usesNativeSshTerminal(endpoint)) {
    const tab = createTab(shellId);
    if (!tab || !isTerminalTab(tab)) return;
    const pane = tab.panes[0];
    if (!pane) return;

    setTabTitle(tab.id, terminalTabTitle(endpoint));
    terminalPaneThemes.value = {
      ...terminalPaneThemes.value,
      [pane.id]: endpoint.themeId,
    };
    pendingTerminalCommands.set(
      pane.id,
      `${buildTerminalLaunchCommand(endpoint, library, shellId)}\r`,
    );
    selectTab(tab.id);
    selectPane(pane.id);
    return;
  }

  const hopError = networkHopIntegratedConnectError(endpoint, "terminal");
  if (hopError) {
    pushAppToast(hopError, "error");
    return;
  }

  const secrets = await resolveConnectSecrets(endpoint, library, {
    askSecret: askSshSecret,
    toast: (message, kind) => pushAppToast(message, kind),
    agentUnsupported: () => {
      pushAppToast("Integrated SSH terminal does not support SSH agent auth. Use a key file or password.", "error");
    },
  }, undefined, { context: "terminal" });
  if (!secrets) return;

  const tab = createTab(shellId);
  if (!tab || !isTerminalTab(tab)) return;
  const pane = tab.panes[0];
  if (!pane) return;

  setTabTitle(tab.id, terminalTabTitle(endpoint));
  terminalPaneThemes.value = {
    ...terminalPaneThemes.value,
    [pane.id]: endpoint.themeId,
  };
  setPaneSshEndpoint(pane.id, endpoint.id);
  setPendingSshTerminalLaunch(pane.id, {
    request: buildSshConnectRequest(endpoint, library, secrets, false),
    startupSnippet: endpoint.startupSnippet.trim() || null,
    trustHostKey: (error) => askSshHostKeyTrust(endpoint, error),
  });

  selectTab(tab.id);
  selectPane(pane.id);
}

function openDockerContainerTerminal(
  container: DockerContainer,
  mode: "logs" | "shell",
) {
  const tab = createTab(resolveDefaultShellId());
  if (!tab || !isTerminalTab(tab)) return;
  const pane = tab.panes[0];
  if (!pane) return;

  const label = container.name || container.id.slice(0, 12);
  setTabTitle(tab.id, mode === "logs" ? `logs: ${label}` : `shell: ${label}`);

  const command =
    mode === "logs"
      ? `docker logs -f --tail 200 ${container.id}`
      : `docker exec -it ${container.id} sh`;
  pendingTerminalCommands.set(pane.id, `${command}\r`);

  selectTab(tab.id);
  selectPane(pane.id);
}

function resolveDefaultShellId() {
  return (
    shells.value.find((shell) => shell.id === defaultShellId.value)?.id ??
    shells.value.find((shell) => shell.id === systemDefaultShellId.value)?.id ??
    shells.value[0]?.id ??
    systemDefaultShellId.value
  );
}

function setDefaultShell(shellId: string) {
  if (!shells.value.some((shell) => shell.id === shellId)) return;
  defaultShellId.value = shellId;
  saveDefaultShellId(shellId);
}

function rememberClosedTab(tab: WorkspaceTerminalTab) {
  const pane = tab.panes[0];
  if (!pane) return;
  closedSessions.value.unshift({
    shellId: pane.shellId,
    cwd: pane.cwd,
    title: tab.title,
    color: tab.color,
  });
  if (closedSessions.value.length > 10) {
    closedSessions.value.length = 10;
  }
}

function reopenClosedSession() {
  const session = closedSessions.value.shift();
  if (!session) return;
  const tab = createTab(session.shellId, session.cwd);
  if (!isTerminalTab(tab)) return;
  setTabTitle(tab.id, session.title);
  setTabColor(tab.id, session.color);
}

async function bootstrap() {
  shells.value = await listShells();
  systemDefaultShellId.value = await getDefaultShellId();

  const saved = getSetting(DEFAULT_SHELL_SETTING_KEY);
  if (!saved) {
    defaultShellId.value = systemDefaultShellId.value;
    saveDefaultShellId(defaultShellId.value);
  } else {
    defaultShellId.value = loadDefaultShellId(systemDefaultShellId.value);
  }

  const resolved = resolveDefaultShellId();
  if (defaultShellId.value !== resolved) {
    defaultShellId.value = resolved;
    saveDefaultShellId(resolved);
  }
  const persisted = loadPersistedTerminalWorkspace();
  if (persisted) {
    const resolveShellId = (shellId: string) =>
      shells.value.some((shell) => shell.id === shellId) ? shellId : resolved;
    const restored = hydrateTerminalWorkspace(persisted, resolveShellId);
    tabs.value = restored.tabs;
    activeTabId.value = restored.activeTabId;
    activePaneId.value = restored.activePaneId;
    return;
  }

  const launchCwd = await getLaunchInitialCwd();
  createTab(resolved, launchCwd ?? undefined);
}

async function closeTab(tabId: string) {
  await closeTabs([tabId]);
}

async function closeTabs(tabIds: string[]) {
  const idsToClose = tabIds.filter((tabId) => {
    if (closingTabIds.has(tabId)) return false;
    closingTabIds.add(tabId);
    return true;
  });

  for (const tabId of idsToClose) {
    try {
      const tab = tabs.value.find((item) => item.id === tabId);
      if (!tab) continue;
      const terminalPanes = isTerminalTab(tab) ? [...tab.panes] : [];
      if (isTerminalTab(tab)) {
        rememberClosedTab(tab);
        for (const pane of terminalPanes) {
          clearPendingSshTerminalLaunch(pane.id);
        }
        if (terminalPanes.length > 0) {
          await Promise.all(terminalPanes.map((pane) => killPaneSession(pane)));
        }
      }
      removeTab(tabId);
      unmountTerminalTab(tabId);
      await nextTick();
    } finally {
      closingTabIds.delete(tabId);
    }
  }
}

function onSaveProfile(draft: SaveProfileDraft) {
  const base = shells.value.find((shell) => shell.id === draft.shellId);
  if (!base) return;
  shells.value.push({
    id: `profile-${Date.now()}`,
    label: draft.label,
    program: base.program,
    args: [...base.args],
  });
}

function selectTerminal(tabId: string, paneId: string) {
  selectTab(tabId);
  if (paneId) selectPane(paneId);
  ensureTerminalMounted(tabId);
}

function onCreateGroup() {
  createGroup("New group");
}

function onRenameGroup(groupId: string, name: string) {
  renameGroup(groupId, name);
}

function onNewGroupAndMove(tabId: string) {
  const group = createGroup("New group");
  moveTabToGroup(tabId, group.id);
}

function onMoveTabToGroup(tabId: string, groupId: string | null) {
  moveTabToGroup(tabId, groupId);
}

function onReorderTerminalTab(tabId: string, toTerminalIndex: number, groupId?: string | null) {
  if (groupId !== undefined) {
    moveTabToGroup(tabId, groupId, toTerminalIndex);
    return;
  }
  const terminalTabs = tabs.value.filter(isTerminalTab);
  const inferredGroupId =
    terminalTabs[toTerminalIndex]?.groupId ??
    terminalTabs[Math.max(0, toTerminalIndex - 1)]?.groupId ??
    null;
  moveTabToGroup(tabId, inferredGroupId, toTerminalIndex);
}

function onSessionBootstrapping(paneId: string, sessionId: string) {
  if (!sessionId) return;
  setPaneBootstrappingSession(paneId, sessionId);
}

function onSessionCreated(paneId: string, sessionId: string) {
  if (!sessionId) return;
  clearPaneBootstrappingSession(paneId);
  setPaneSession(paneId, sessionId);
  const pane = findWorkspacePane(paneId);
  if (pane?.sshEndpointId) {
    clearPendingSshTerminalLaunch(paneId);
    return;
  }
  const command = pendingTerminalCommands.get(paneId);
  if (!command) return;
  pendingTerminalCommands.delete(paneId);
  void writeTerminal(sessionId, command);
}

function onSessionReleased(paneId: string) {
  clearPaneBootstrappingSession(paneId);
  clearPaneSession(paneId);
}

function onSessionEnded(paneId: string) {
  const tab = tabs.value.find((t) => isTerminalTab(t) && t.panes.some((p) => p.id === paneId));
  if (!tab || !isTerminalTab(tab)) {
    clearPaneSession(paneId);
    return;
  }
  if (closingTabIds.has(tab.id)) return;
  void closeTab(tab.id);
}

function onKeyDown(event: KeyboardEvent) {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "t") {
    consumeAppShortcut(event);
    createTab(resolveDefaultShellId());
    return;
  }
  if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "t") {
    consumeAppShortcut(event);
    reopenClosedSession();
    return;
  }
  if (event.ctrlKey && event.key.toLowerCase() === "r") {
    consumeAppShortcut(event);
    openSearch();
    return;
  }
  if (isTabCycleShortcut(event)) {
    if (tabs.value.length <= 1) return;
    consumeAppShortcut(event);
    const currentIndex = tabs.value.findIndex((t) => t.id === activeTabId.value);
    const startIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = event.shiftKey
      ? (startIndex - 1 + tabs.value.length) % tabs.value.length
      : (startIndex + 1) % tabs.value.length;
    selectTab(tabs.value[nextIndex].id);
    return;
  }
  if (event.key === "Escape" && historyOpen.value) {
    consumeAppShortcut(event);
    closeSearch();
  }
}

function shellLineEnding() {
  return "\r";
}

async function insertHistoryEntry(entry: string) {
  closeSearch();
  const pane = activePane.value;
  if (!pane?.sessionId) return;
  const payload = `${entry}${shellLineEnding()}`;
  if (pane.sshEndpointId) {
    await sshTerminalWrite(pane.sessionId, payload);
  } else {
    await writeTerminal(pane.sessionId, payload);
  }
  onCommandSubmitted(entry);
}

function onCommandSubmitted(command: string) {
  addEntry(command);
  void refreshGitViews();
}

function onAgentModeChanged(paneId: string, agentId: CliAgentId | null) {
  setPaneAgent(paneId, agentId);
}

function onOscTitleChanged(paneId: string, title: string | null) {
  setPaneOscTitle(paneId, title);
}

function findTerminalPane(paneId: string) {
  for (const tab of tabs.value) {
    if (!isTerminalTab(tab)) continue;
    const pane = tab.panes.find((entry) => entry.id === paneId);
    if (pane) return pane;
  }
  return null;
}

function findTerminalPaneBySessionId(sessionId: string) {
  for (const tab of tabs.value) {
    if (!isTerminalTab(tab)) continue;
    const pane = tab.panes.find(
      (entry) =>
        entry.sessionId === sessionId || entry.bootstrappingSessionId === sessionId,
    );
    if (pane) return pane;
  }
  return null;
}

function onNotificationReceived(
  paneId: string,
  completedAgentId?: CliAgentId | null,
) {
  const pane = findTerminalPane(paneId);
  const alreadyUnseen = pane?.hasUnseenNotification ?? false;
  setPaneUnseenNotification(paneId, true);

  if (alreadyUnseen || !pane) return;
  if (shouldSuppressReadyNotification(paneId)) return;

  const shellLabel = shellLabelFor(shells.value, pane.shellId);
  void sendTerminalSystemNotification(
    buildTerminalNotificationContent(pane, shellLabel, completedAgentId),
  );
}

function onTerminalAgentChanged(sessionId: string, agentId: CliAgentId | null) {
  const pane = findTerminalPaneBySessionId(sessionId);
  if (pane) setPaneAgent(pane.id, agentId);
}

function onTerminalProcessChanged(
  sessionId: string,
  processName: string | null,
  command: string | null,
) {
  const pane = findTerminalPaneBySessionId(sessionId);
  if (pane) setPaneProcess(pane.id, processName, command);
}

async function openPathInTerminal(path: string) {
  const pane = activePane.value;
  if (!pane?.sessionId) return;
  const command =
    pane.shellId === "cmd"
      ? `cd /d "${path}"`
      : `Set-Location -LiteralPath '${path.replace(/'/g, "''")}'`;
  const payload = `${command}${shellLineEnding()}`;
  if (pane.sshEndpointId) {
    await sshTerminalWrite(pane.sessionId, payload);
  } else {
    await writeTerminal(pane.sessionId, payload);
  }
}

async function onSwitchBranch(
  branch: string,
  isRemote: boolean,
  repoRootOverride?: string,
) {
  if (gitBranchSwitchBusy.value) return;
  const repoRoot = repoRootOverride ?? sourceControlStatus.value.repoRoot;
  if (!repoRoot) return;

  gitBranchSwitchBusy.value = true;
  try {
    await runGitAction(async () => {
      await switchGitBranch({
        repoRoot,
        branch,
        isRemote,
        currentBranch: sourceControlStatus.value.branch,
        activeCwd: activePane.value?.cwd,
        cdToPath: openPathInTerminal,
      });
    });
    await refreshGitViews();
  } catch (err) {
    notifyGitError(err);
    throw err;
  } finally {
    gitBranchSwitchBusy.value = false;
  }
}

function cdFromExplorer(path: string, isDir: boolean) {
  if (isDir) {
    void openPathInTerminal(path);
    return;
  }

  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  parts.pop();
  const parent = parts.join("\\") || path;
  void openPathInTerminal(parent);
}

async function refitTerminals() {
  await nextTick();
  window.dispatchEvent(new Event("resize"));
}

let unlistenTerminalAgentChanged: (() => void) | null = null;
let unlistenTerminalProcessChanged: (() => void) | null = null;

function onWindowFocus() {
  void refreshGitViews();
}

onMounted(() => {
  sidebarWidthPx.value = loadSidebarWidth();
  void bootstrap();
  void getVersion().then((version) => {
    appVersion.value = version;
  }).catch((err) => {
    console.error("Failed to load app version:", err);
  });
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("focus", onWindowFocus);
  void listenTerminalAgentChanged((event) => {
    onTerminalAgentChanged(
      event.sessionId,
      event.agentId as CliAgentId | null,
    );
  }).then((unlisten) => {
    unlistenTerminalAgentChanged = unlisten;
  });
  void listenTerminalProcessChanged((event) => {
    onTerminalProcessChanged(
      event.sessionId,
      event.processName,
      event.command,
    );
  }).then((unlisten) => {
    unlistenTerminalProcessChanged = unlisten;
  });
});

watch(
  [terminalSidebarOpen, toolsOpen, sourceControlOpen, sourceControlWidth, sourceControlResizing],
  () => {
    if (sourceControlResizing.value) return;
    void refitTerminals();
  },
);

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown, true);
  window.removeEventListener("focus", onWindowFocus);
  window.clearTimeout(promptGitRefreshTimer);
  unlistenTerminalAgentChanged?.();
  unlistenTerminalProcessChanged?.();
});
</script>

<template>
  <div class="oterm-app relative flex h-full flex-col overflow-hidden">
    <TooltipLayer />
    <AppToastLayer />
    <TitleBar
      :terminal-sidebar-open="terminalSidebarOpen"
      :tools-open="toolsOpen"
      :source-control-open="sourceControlOpen"
      :git-status="gitBadgeStatus"
      :git-branches="gitBranches"
      :git-busy="sourceControlBusy || gitBranchSwitchBusy"
      :git-worktree-hint="gitWorktreeHint"
      :can-open-git-features="canOpenGitFeatures"
      :app-version="appVersion"
      :sidebar-width-px="sidebarWidthPx"
      @toggle-terminal-sidebar="terminalSidebarOpen = !terminalSidebarOpen"
      @toggle-tools="toolsOpen = !toolsOpen"
      @toggle-source-control="toggleSourceControl"
      @switch-branch="onSwitchBranch"
      @open-ssh-sftp="openSshSftp"
      @open-docker-manager="openDockerManager"
      @open-pull-requests="openPullRequests"
      @open-issues="openIssues"
      @open-branch-manager="openBranchManager"
      @open-settings="openSettings"
    />

    <div class="flex min-h-0 flex-1 overflow-hidden">
      <SidebarRail
        v-if="terminalSidebarOpen"
        :tabs="tabs"
        :terminal-groups="terminalGroups"
        :collapsed-group-ids="collapsedGroupIds"
        :active-tab-id="activeTabId"
        :active-pane-id="activePaneId"
        :shells="shells"
        :default-shell-id="defaultShellId"
        :can-reopen-closed="canReopenClosed"
        :width-px="sidebarWidthPx"
        @select="selectTerminal"
        @close="closeTab"
        @close-many="closeTabs"
        @add="createTab"
        @split="splitActiveTabHorizontal"
        @reopen-closed="reopenClosedSession"
        @set-default-shell="setDefaultShell"
        @rename-tab="setTabTitle"
        @move-tab="moveTab"
        @reorder-tab="onReorderTerminalTab"
        @color-change="setTabColor"
        @save-profile="onSaveProfile"
        @create-group="onCreateGroup"
        @rename-group="onRenameGroup"
        @delete-group="deleteGroup"
        @group-color-change="setGroupColor"
        @toggle-group-collapsed="toggleGroupCollapsed"
        @move-tab-to-group="onMoveTabToGroup"
        @new-group-and-move="onNewGroupAndMove"
        :git-refresh-token="gitRefreshToken"
        :active-pane-git="activePaneGit"
      />

      <div
        v-if="terminalSidebarOpen"
        class="no-drag relative z-20 w-[1px] shrink-0 cursor-col-resize bg-[var(--oterm-border)] hover:bg-[var(--oterm-accent)]/40 transition-colors"
        :class="sidebarResizing ? 'bg-[var(--oterm-accent)]' : ''"
        title="Drag to resize sidebar"
        @pointerdown="onSidebarResizePointerDown"
      >
        <div class="absolute -inset-x-1.5 top-0 bottom-0 z-30 cursor-col-resize" />
      </div>

      <ToolsPanel
        v-if="toolsOpen"
        :root-path="projectRoot"
        @navigate="cdFromExplorer"
      />

      <div
        class="relative flex min-w-0 flex-1 flex-col"
        :class="toolsOpen ? 'border-l border-[var(--oterm-border)]' : ''"
      >
        <SessionHeader
          v-if="activePane && activeTerminalTab"
          :pane="activePane"
          :shells="shells"
          :tab-title="activeTerminalTab.title"
        />

        <main class="relative flex min-h-0 flex-1 flex-col">
          <HistorySearch
            v-if="activePane"
            :open="historyOpen"
            :query="historyQuery"
            :entries="filteredHistory"
            @update:query="(value) => (historyQuery = value)"
            @close="closeSearch"
            @select="insertHistoryEntry"
          />

          <template v-for="tab in tabs" :key="tab.id">
            <section
              v-if="tab.kind === 'terminal' && mountedTerminalTabIds.has(tab.id)"
              v-show="tab.id === activeTabId"
              class="flex min-h-0 flex-1 divide-[var(--oterm-border)]"
              :class="tab.split === 'horizontal' ? 'flex-row divide-x' : 'flex-col divide-y'"
            >
              <TerminalPane
                v-for="pane in tab.panes"
                :key="pane.id"
                :ref="bindTerminalPaneRef(pane.id)"
                :pane-id="pane.id"
                :session-id="pane.sessionId"
                :shell-id="pane.shellId"
                :initial-cwd="pane.cwd"
                :active="pane.id === activePaneId"
                :tab-active="tab.id === activeTabId"
                :active-agent-id="pane.activeAgentId"
                :theme-id="terminalPaneThemes[pane.id] ?? null"
                :ssh-endpoint-id="pane.sshEndpointId"
                @session-created="onSessionCreated"
                @session-bootstrapping="onSessionBootstrapping"
                @session-ended="onSessionEnded"
                @session-released="onSessionReleased"
                @cwd-changed="setPaneCwd"
                @prompt-ready="onPromptReady"
                @command-submitted="onCommandSubmitted"
                @agent-mode-changed="onAgentModeChanged"
                @osc-title-changed="onOscTitleChanged"
                @notification-received="onNotificationReceived"
                @composer-open-changed="onComposerOpenChanged"
                @focus-pane="selectPane(pane.id)"
              />
            </section>
            <PullRequestsView
              v-else-if="tab.kind === 'pullRequests'"
              v-show="tab.id === activeTabId"
              class="flex min-h-0 flex-1"
              :repo-root="tab.repoRoot"
              @refresh-git="refreshGitViews"
              @close="closeTab(tab.id)"
            />
            <BranchManagerView
              v-else-if="tab.kind === 'branchManager'"
              v-show="tab.id === activeTabId"
              class="flex min-h-0 flex-1"
              :repo-root="tab.repoRoot"
              :switch-branch="onSwitchBranch"
              @refresh-git="refreshGitViews"
              @close="closeTab(tab.id)"
            />
            <IssuesView
              v-else-if="tab.kind === 'issues'"
              v-show="tab.id === activeTabId"
              class="flex min-h-0 flex-1"
              :repo-root="tab.repoRoot"
              @refresh-git="refreshGitViews"
              @close="closeTab(tab.id)"
            />
            <DockerManagerView
              v-else-if="tab.kind === 'docker'"
              v-show="tab.id === activeTabId"
              class="flex min-h-0 flex-1"
              @close="closeTab(tab.id)"
              @open-container-logs="openDockerContainerTerminal($event, 'logs')"
              @open-container-shell="openDockerContainerTerminal($event, 'shell')"
            />
            <SshSftpManagerView
              v-else-if="tab.kind === 'sshSftp'"
              v-show="tab.id === activeTabId"
              class="flex min-h-0 flex-1"
              @close="closeTab(tab.id)"
              @open-ssh-terminal="openSshTerminal"
            />
            <SettingsView
              v-else-if="tab.kind === 'settings'"
              v-show="tab.id === activeTabId"
              class="flex min-h-0 flex-1"
              @close="closeTab(tab.id)"
            />
          </template>
        </main>

        <StatusBar
          :pane="activePane"
          :shells="shells"
          :git-status="gitBadgeStatus"
          :terminal-sidebar-open="terminalSidebarOpen"
          :tools-open="toolsOpen"
          :source-control-open="sourceControlOpen"
          :active-pr="activePr"
          :pr-loading="activePrLoading"
          :agent-composer-open="activeAgentComposerOpen"
          @toggle-terminal-sidebar="terminalSidebarOpen = !terminalSidebarOpen"
          @toggle-tools="toolsOpen = !toolsOpen"
          @toggle-source-control="toggleSourceControl"
          @toggle-agent-composer="toggleActiveAgentComposer"
          @open-pull-requests="openPullRequests"
        />
      </div>

      <div
        v-if="sourceControlOpen"
        class="flex shrink-0 flex-col overflow-hidden border-l border-[var(--oterm-border)]"
        :style="{ width: `${sourceControlWidth}px` }"
      >
        <div
          v-if="createPrBannerVisible"
          class="flex shrink-0 items-start gap-2 border-b border-[var(--oterm-border)] bg-[var(--oterm-accent)]/10 px-3 py-2"
        >
          <p class="min-w-0 flex-1 text-xs leading-relaxed text-[var(--oterm-text)]">
            Branch pushed. Create a pull request for
            <span class="font-medium">{{ createPrHead || sourceControlStatus.branch }}</span>?
          </p>
          <button
            type="button"
            class="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-[var(--oterm-accent)] transition hover:bg-white/5"
            @click="openCreatePrDialog"
          >
            Create PR
          </button>
          <button
            type="button"
            class="shrink-0 rounded p-0.5 text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)]"
            title="Dismiss"
            aria-label="Dismiss"
            @click="dismissCreatePrBanner"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor">
              <path d="M3 3l8 8M11 3L3 11" stroke-width="1.4" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <div class="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div
          class="absolute inset-y-0 left-0 z-20 w-2 cursor-col-resize"
          :class="sourceControlResizing ? 'bg-[var(--oterm-accent)]/30' : 'hover:bg-white/5'"
          title="Drag to resize"
          @pointerdown="onResizeHandlePointerDown"
        />
        <SourceControlPanel
          ref="sourceControlPanelRef"
          :status="sourceControlStatus"
          :history="gitHistory"
          :loading="sourceControlLoading"
          :busy="sourceControlBusy"
          :operation="sourceControlOperation"
          :operation-label="sourceControlOperationLabel"
          :panel-width="sourceControlWidth"
          :file-list-width="sourceControlFileListWidth"
          :on-file-list-resize-pointer-down="onFileListResizePointerDown"
          :graph-refresh-token="gitGraphRefreshToken"
          @refresh="() => runGitAction(refreshSourceControl)"
          @stage="(paths) => runGitAction(() => stageGitPaths(paths))"
          @unstage="(paths) => runGitAction(() => unstageGitPaths(paths))"
          @revert="(paths, untracked) => runGitAction(() => revertGitPaths(paths, untracked))"
          @revert-all="() => runGitAction(revertAllGitChanges)"
          @commit="(message) => runGitAction(() => commitGitChanges(message))"
          @fetch="() => runGitActionWithFeedback(fetchGitRepo)"
          @pull="() => runGitActionWithFeedback(pullGitRepo)"
          @push="onPushGit"
          @sync="onSyncGit"
          @revert-hunk="(path, patch, staged) => runGitHunkAction(() => revertGitHunk(path, patch, staged))"
          @stage-hunk="(path, patch) => runGitHunkAction(() => stageGitHunk(path, patch))"
          @unstage-hunk="(path, patch) => runGitHunkAction(() => unstageGitHunk(path, patch))"
          @diff-expanded-change="onDiffExpandedChange"
        />
        </div>
      </div>
    </div>

    <SshSecretPrompt
      v-if="sshSecretOpen"
      :title="sshSecretTitle"
      :label="sshSecretLabel"
      :model-value="sshSecretValue"
      :save-password="sshSecretSave"
      :show-save-password="sshSecretShowSave"
      :save-checkbox-label="sshSecretSaveLabel"
      @update:model-value="sshSecretValue = $event"
      @update:save-password="sshSecretSave = $event"
      @submit="submitSshSecret"
      @cancel="cancelSshSecret"
    />
    <ConfirmDialog
      :open="sshConfirmOpen"
      :title="sshConfirmTitle"
      :message="sshConfirmMessage"
      :confirm-label="sshConfirmLabel"
      @confirm="resolveSshConfirm(true)"
      @cancel="resolveSshConfirm(false)"
    />
    <CreatePullRequestDialog
      :open="createPrOpen"
      :branches="gitBranches"
      :title="createPrTitle"
      :body="createPrBody"
      :base="createPrBase"
      :head="createPrHead"
      :draft="createPrDraft"
      :busy="createPrBusy"
      :error="createPrError"
      @update:title="createPrTitle = $event"
      @update:body="createPrBody = $event"
      @update:base="createPrBase = $event"
      @update:head="createPrHead = $event"
      @update:draft="createPrDraft = $event"
      @confirm="submitCreatePr"
      @cancel="closeCreatePrDialog"
    />
  </div>
</template>
