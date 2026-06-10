<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import HistorySearch from "./components/HistorySearch.vue";
import SessionHeader from "./components/SessionHeader.vue";
import SidebarRail from "./components/SidebarRail.vue";
import SourceControlPanel from "./components/SourceControlPanel.vue";
import StatusBar from "./components/StatusBar.vue";
import TerminalPane from "./components/TerminalPane.vue";
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
import type { ClosedTerminalSession, SaveProfileDraft, WorkspaceTerminalTab } from "./types/terminal";
import { isTerminalTab } from "./types/terminal";
import {
  DEFAULT_SHELL_SETTING_KEY,
  loadDefaultShellId,
  saveDefaultShellId,
} from "./lib/shellSettings";
import { getSetting } from "./lib/settingsStore";
import { loadPersistedTerminalWorkspace } from "./lib/workspaceStore";
import type { DockerContainer } from "./types/docker";
import type { SshEndpoint } from "./types/sshSftp";
import { getLaunchInitialCwd } from "./lib/launchApi";
import {
  getDefaultShellId,
  killTerminal,
  listShells,
  listenTerminalAgentChanged,
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

const appVersion = "0.1.0";

const systemDefaultShellId = ref("cmd");
const defaultShellId = ref("");
const closedSessions = ref<ClosedTerminalSession[]>([]);
const pendingTerminalCommands = new Map<string, string>();
const canReopenClosed = computed(() => closedSessions.value.length > 0);
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
  ensureDiffPaneWidth,
  onResizeHandlePointerDown,
  onFileListResizePointerDown,
} = useResizablePanel(() => {
  void refitTerminals();
});

const {
  shells,
  tabs,
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
  clearPaneSession,
  setPaneCwd,
  setPaneAgent,
  setPaneOscTitle,
  setPaneUnseenNotification,
  setTabTitle,
  setTabColor,
  moveTab,
  reorderTerminalTab,
  serializeTerminalWorkspace,
  hydrateTerminalWorkspace,
} = useWorkspace(() => defaultShellId.value);

useWorkspacePersistence(tabs, activeTabId, activePaneId, serializeTerminalWorkspace);

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

const activePaneGit = computed(() => ({
  paneId: activePaneId.value ?? "",
  branch: sourceControlStatus.value.branch,
  isRepo: sourceControlStatus.value.isRepo,
  changedFiles: sourceControlStatus.value.changedFiles,
  additions: sourceControlStatus.value.additions,
  deletions: sourceControlStatus.value.deletions,
}));

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
      ensureDiffPaneWidth();
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
  if (sourceControlOpen.value) {
    ensureDiffPaneWidth();
  }
  void refreshGitViews();
}

const projectRoot = computed(() => {
  const cwd = activePane.value?.cwd;
  if (!cwd || cwd === "~") return "~";
  return cwd;
});

const gitRepoRoot = computed(() => sourceControlStatus.value.repoRoot ?? null);
const activeBranch = computed(() => sourceControlStatus.value.branch);
const { activePr, loading: activePrLoading } = useActiveBranchPr(
  gitRepoRoot,
  activeBranch,
  gitRefreshToken,
);
const canOpenGitFeatures = computed(() => Boolean(gitRepoRoot.value));

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

function buildSshCommand(endpoint: SshEndpoint) {
  const target = `${endpoint.username}@${endpoint.host}`;
  if (endpoint.authMethod === "publicKey" && endpoint.keyPath?.trim()) {
    const keyPath = endpoint.keyPath.trim().replace(/"/g, '\\"');
    return `ssh -p ${endpoint.port} -i "${keyPath}" ${target}`;
  }
  return `ssh -p ${endpoint.port} ${target}`;
}

function openSshTerminal(endpoint: SshEndpoint) {
  const tab = createTab(resolveDefaultShellId());
  if (!tab || !isTerminalTab(tab)) return;
  const pane = tab.panes[0];
  if (!pane) return;

  setTabTitle(tab.id, `ssh: ${endpoint.name || endpoint.host}`);
  pendingTerminalCommands.set(pane.id, `${buildSshCommand(endpoint)}\r`);

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
  for (const tabId of tabIds) {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (!tab) continue;
    if (isTerminalTab(tab)) {
      rememberClosedTab(tab);
      for (const pane of tab.panes) {
        if (pane.sessionId) {
          await killTerminal(pane.sessionId);
        }
      }
    }
    removeTab(tabId);
  }
  if (tabs.value.length === 0) {
    createTab(resolveDefaultShellId());
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
}

function onSessionCreated(paneId: string, sessionId: string) {
  if (!sessionId) return;
  setPaneSession(paneId, sessionId);
  const command = pendingTerminalCommands.get(paneId);
  if (!command) return;
  pendingTerminalCommands.delete(paneId);
  void writeTerminal(sessionId, command);
}

function onSessionEnded(paneId: string) {
  const tab = tabs.value.find(
    (t) => isTerminalTab(t) && t.panes.some((p) => p.id === paneId),
  );
  if (tab) {
    void closeTabs([tab.id]);
  } else {
    clearPaneSession(paneId);
  }
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
  await writeTerminal(pane.sessionId, `${entry}${shellLineEnding()}`);
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

function onNotificationReceived(paneId: string) {
  const pane = findTerminalPane(paneId);
  const alreadyUnseen = pane?.hasUnseenNotification ?? false;
  setPaneUnseenNotification(paneId, true);

  if (alreadyUnseen || !pane) return;

  const shellLabel = shellLabelFor(shells.value, pane.shellId);
  void sendTerminalSystemNotification(
    buildTerminalNotificationContent(pane, shellLabel),
  );
}

function onTerminalAgentChanged(sessionId: string, agentId: CliAgentId | null) {
  for (const tab of tabs.value) {
    if (!isTerminalTab(tab)) continue;
    const pane = tab.panes.find((entry) => entry.sessionId === sessionId);
    if (pane) {
      setPaneAgent(pane.id, agentId);
      return;
    }
  }
}

async function openPathInTerminal(path: string) {
  const pane = activePane.value;
  if (!pane?.sessionId) return;
  const command =
    pane.shellId === "cmd"
      ? `cd /d "${path}"`
      : `Set-Location -LiteralPath '${path.replace(/'/g, "''")}'`;
  await writeTerminal(pane.sessionId, `${command}${shellLineEnding()}`);
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

onMounted(() => {
  void bootstrap();
  window.addEventListener("keydown", onKeyDown, true);
  void listenTerminalAgentChanged((event) => {
    onTerminalAgentChanged(
      event.sessionId,
      event.agentId as CliAgentId | null,
    );
  }).then((unlisten) => {
    unlistenTerminalAgentChanged = unlisten;
  });
});

watch([terminalSidebarOpen, toolsOpen, sourceControlOpen, sourceControlWidth], () => {
  void refitTerminals();
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown, true);
  window.clearTimeout(promptGitRefreshTimer);
  unlistenTerminalAgentChanged?.();
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
        :active-tab-id="activeTabId"
        :active-pane-id="activePaneId"
        :shells="shells"
        :default-shell-id="defaultShellId"
        :can-reopen-closed="canReopenClosed"
        @select="selectTerminal"
        @close="closeTab"
        @close-many="closeTabs"
        @add="createTab"
        @split="splitActiveTabHorizontal"
        @reopen-closed="reopenClosedSession"
        @set-default-shell="setDefaultShell"
        @rename-tab="setTabTitle"
        @move-tab="moveTab"
        @reorder-tab="reorderTerminalTab"
        @color-change="setTabColor"
        @save-profile="onSaveProfile"
        :git-refresh-token="gitRefreshToken"
        :active-pane-git="activePaneGit"
      />

      <ToolsPanel
        v-if="toolsOpen"
        :class="terminalSidebarOpen ? 'border-l border-[var(--oterm-border)]' : ''"
        :root-path="projectRoot"
        @navigate="cdFromExplorer"
      />

      <div
        class="relative flex min-w-0 flex-1 flex-col"
        :class="terminalSidebarOpen || toolsOpen ? 'border-l border-[var(--oterm-border)]' : ''"
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
              v-if="tab.kind === 'terminal'"
              v-show="tab.id === activeTabId"
              class="flex min-h-0 flex-1 divide-[var(--oterm-border)]"
              :class="tab.split === 'horizontal' ? 'flex-row divide-x' : 'flex-col'"
            >
              <TerminalPane
                v-for="pane in tab.panes"
                :key="pane.id"
                :pane-id="pane.id"
                :session-id="pane.sessionId"
                :shell-id="pane.shellId"
                :initial-cwd="pane.cwd"
                :active="pane.id === activePaneId"
                :tab-active="tab.id === activeTabId"
                :active-agent-id="pane.activeAgentId"
                @session-created="onSessionCreated"
                @session-ended="onSessionEnded"
                @cwd-changed="setPaneCwd"
                @prompt-ready="onPromptReady"
                @command-submitted="onCommandSubmitted"
                @agent-mode-changed="onAgentModeChanged"
                @osc-title-changed="onOscTitleChanged"
                @notification-received="onNotificationReceived"
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
          @toggle-terminal-sidebar="terminalSidebarOpen = !terminalSidebarOpen"
          @toggle-tools="toolsOpen = !toolsOpen"
          @toggle-source-control="toggleSourceControl"
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
          @expand-panel="ensureDiffPaneWidth"
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
