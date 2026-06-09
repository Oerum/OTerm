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
import PullRequestsView from "./components/PullRequestsView.vue";
import SettingsView from "./components/SettingsView.vue";
import TitleBar from "./components/TitleBar.vue";
import ToolsPanel from "./components/ToolsPanel.vue";
import { useResizablePanel } from "./composables/useResizablePanel";
import { useSourceControl } from "./composables/useSourceControl";
import { useTerminalHistory } from "./composables/useTerminalHistory";
import { useWorkspace } from "./composables/useWorkspace";
import type { ClosedTerminalSession, SaveProfileDraft, WorkspaceTerminalTab } from "./types/terminal";
import { isTerminalTab } from "./types/terminal";
import { loadDefaultShellId, saveDefaultShellId } from "./lib/shellSettings";
import type { DockerContainer } from "./types/docker";
import type { SshEndpoint } from "./types/sshSftp";
import { killTerminal, listShells, writeTerminal } from "./lib/terminalApi";

const appVersion = "0.1.0";

const FALLBACK_SHELL_ID = "pwsh";
const defaultShellId = ref(loadDefaultShellId(FALLBACK_SHELL_ID));
const closedSessions = ref<ClosedTerminalSession[]>([]);
const pendingTerminalCommands = new Map<string, string>();
const canReopenClosed = computed(() => closedSessions.value.length > 0);
const terminalSidebarOpen = ref(true);
const toolsOpen = ref(false);
const sourceControlOpen = ref(false);
const gitRefreshToken = ref(0);

const {
  widthPx: sourceControlWidth,
  resizing: sourceControlResizing,
  onResizeHandlePointerDown,
} = useResizablePanel(() => {
  void refitTerminals();
});

const {
  shells,
  tabs,
  activeTabId,
  activePaneId,
  activePane,
  createTab,
  openPullRequestsTab,
  openBranchManagerTab,
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
  setTabTitle,
  setTabColor,
  moveTab,
} = useWorkspace(() => defaultShellId.value);

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
  loading: sourceControlLoading,
  operation: sourceControlOperation,
  operationLabel: sourceControlOperationLabel,
  busy: sourceControlBusy,
  refresh: refreshSourceControl,
  stage: stageGitPaths,
  unstage: unstageGitPaths,
  revert: revertGitPaths,
  commit: commitGitChanges,
  fetch: fetchGitRepo,
  pull: pullGitRepo,
  push: pushGitRepo,
  sync: syncGitRepo,
  checkout: checkoutGitBranch,
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
const canOpenGitFeatures = computed(() => Boolean(gitRepoRoot.value));

function openPullRequests() {
  const root = gitRepoRoot.value;
  if (!root) return;
  openPullRequestsTab(root);
}

function openBranchManager() {
  const root = gitRepoRoot.value;
  if (!root) return;
  openBranchManagerTab(root);
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
    shells.value[0]?.id ??
    FALLBACK_SHELL_ID
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
  createTab(session.shellId);
  const tab = tabs.value[tabs.value.length - 1];
  if (!tab || !isTerminalTab(tab)) return;
  setTabTitle(tab.id, session.title);
  setTabColor(tab.id, session.color);
  const pane = tab.panes[0];
  if (pane) setPaneCwd(pane.id, session.cwd);
}

async function bootstrap() {
  shells.value = await listShells();
  const resolved = resolveDefaultShellId();
  if (defaultShellId.value !== resolved) {
    defaultShellId.value = resolved;
    saveDefaultShellId(resolved);
  }
  createTab(resolved);
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
    event.preventDefault();
    createTab(resolveDefaultShellId());
    return;
  }
  if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "t") {
    event.preventDefault();
    reopenClosedSession();
    return;
  }
  if (event.ctrlKey && event.key.toLowerCase() === "r") {
    event.preventDefault();
    openSearch();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "Tab") {
    if (tabs.value.length <= 1) return;
    event.preventDefault();
    const currentIndex = tabs.value.findIndex((t) => t.id === activeTabId.value);
    const startIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = event.shiftKey
      ? (startIndex - 1 + tabs.value.length) % tabs.value.length
      : (startIndex + 1) % tabs.value.length;
    selectTab(tabs.value[nextIndex].id);
    return;
  }
  if (event.key === "Escape" && historyOpen.value) {
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

async function openPathInTerminal(path: string) {
  const pane = activePane.value;
  if (!pane?.sessionId) return;
  const command =
    pane.shellId === "cmd"
      ? `cd /d "${path}"`
      : `Set-Location -LiteralPath '${path.replace(/'/g, "''")}'`;
  await writeTerminal(pane.sessionId, `${command}${shellLineEnding()}`);
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

onMounted(() => {
  void bootstrap();
  window.addEventListener("keydown", onKeyDown);
});

watch([terminalSidebarOpen, toolsOpen, sourceControlOpen, sourceControlWidth], () => {
  void refitTerminals();
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
  window.clearTimeout(promptGitRefreshTimer);
});
</script>

<template>
  <div class="warp-app relative flex h-full flex-col">
    <TitleBar
      :terminal-sidebar-open="terminalSidebarOpen"
      :tools-open="toolsOpen"
      :source-control-open="sourceControlOpen"
      :git-status="gitBadgeStatus"
      :can-open-git-features="canOpenGitFeatures"
      :app-version="appVersion"
      @toggle-terminal-sidebar="terminalSidebarOpen = !terminalSidebarOpen"
      @toggle-tools="toolsOpen = !toolsOpen"
      @toggle-source-control="toggleSourceControl"
      @open-ssh-sftp="openSshSftp"
      @open-docker-manager="openDockerManager"
      @open-pull-requests="openPullRequests"
      @open-branch-manager="openBranchManager"
      @open-settings="openSettings"
    />

    <div class="flex min-h-0 flex-1">
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
        @color-change="setTabColor"
        @save-profile="onSaveProfile"
        :git-refresh-token="gitRefreshToken"
        :active-pane-git="activePaneGit"
      />

      <ToolsPanel
        v-if="toolsOpen"
        :class="terminalSidebarOpen ? 'border-l border-[var(--warp-border)]' : ''"
        :root-path="projectRoot"
        @navigate="cdFromExplorer"
      />

      <div
        class="relative flex min-w-0 flex-1 flex-col"
        :class="terminalSidebarOpen || toolsOpen ? 'border-l border-[var(--warp-border)]' : ''"
      >
        <SessionHeader v-if="activePane" :pane="activePane" :shells="shells" />

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
              class="flex min-h-0 flex-1 divide-[var(--warp-border)]"
              :class="tab.split === 'horizontal' ? 'flex-row divide-x' : 'flex-col'"
            >
              <TerminalPane
                v-for="pane in tab.panes"
                :key="pane.id"
                :pane-id="pane.id"
                :session-id="pane.sessionId"
                :shell-id="pane.shellId"
                :active="pane.id === activePaneId"
                @session-created="onSessionCreated"
                @session-ended="onSessionEnded"
                @cwd-changed="setPaneCwd"
                @prompt-ready="onPromptReady"
                @command-submitted="onCommandSubmitted"
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
          @toggle-terminal-sidebar="terminalSidebarOpen = !terminalSidebarOpen"
          @toggle-tools="toolsOpen = !toolsOpen"
          @toggle-source-control="toggleSourceControl"
        />
      </div>

      <div v-if="sourceControlOpen" class="relative flex shrink-0">
        <div
          class="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize"
          :class="sourceControlResizing ? 'bg-[var(--warp-accent)]/30' : 'hover:bg-white/5'"
          title="Drag to resize"
          @pointerdown="onResizeHandlePointerDown"
        />
        <SourceControlPanel
          :status="sourceControlStatus"
          :branches="gitBranches"
          :history="gitHistory"
          :loading="sourceControlLoading"
          :busy="sourceControlBusy"
          :operation="sourceControlOperation"
          :operation-label="sourceControlOperationLabel"
          :panel-width="sourceControlWidth"
          @refresh="() => runGitAction(refreshSourceControl)"
          @stage="(paths) => runGitAction(() => stageGitPaths(paths))"
          @unstage="(paths) => runGitAction(() => unstageGitPaths(paths))"
          @revert="(paths, untracked) => runGitAction(() => revertGitPaths(paths, untracked))"
          @commit="(message) => runGitAction(() => commitGitChanges(message))"
          @fetch="() => runGitAction(fetchGitRepo)"
          @pull="() => runGitAction(pullGitRepo)"
          @push="() => runGitAction(pushGitRepo)"
          @sync="() => runGitAction(syncGitRepo)"
          @checkout="(branch, remote) => runGitAction(() => checkoutGitBranch(branch, remote))"
        />
      </div>
    </div>

  </div>
</template>
