<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import HistorySearch from "./components/HistorySearch.vue";
import SessionHeader from "./components/SessionHeader.vue";
import SidebarRail from "./components/SidebarRail.vue";
import SourceControlPanel from "./components/SourceControlPanel.vue";
import StatusBar from "./components/StatusBar.vue";
import TerminalPane from "./components/TerminalPane.vue";
import TitleBar from "./components/TitleBar.vue";
import ToolsPanel from "./components/ToolsPanel.vue";
import { useGitStatus } from "./composables/useGitStatus";
import { useResizablePanel } from "./composables/useResizablePanel";
import { useSourceControl } from "./composables/useSourceControl";
import { useTerminalHistory } from "./composables/useTerminalHistory";
import { useWorkspace } from "./composables/useWorkspace";
import type { SaveProfileDraft } from "./types/terminal";
import { killTerminal, listShells, writeTerminal } from "./lib/terminalApi";

const appVersion = "0.1.0";

const defaultShellId = "pwsh";
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
} = useWorkspace(defaultShellId);

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
const { status: gitStatus, refresh: refreshGitStatus, refreshNow: refreshGitStatusNow } =
  useGitStatus(activeCwd);
const {
  status: sourceControlStatus,
  history: gitHistory,
  loading: sourceControlLoading,
  refresh: refreshSourceControl,
  stage: stageGitPaths,
  unstage: unstageGitPaths,
  revert: revertGitPaths,
  commit: commitGitChanges,
} = useSourceControl(activeCwd);

async function onGitMutated() {
  await refreshGitStatusNow();
  gitRefreshToken.value += 1;
}

function toggleSourceControl() {
  sourceControlOpen.value = !sourceControlOpen.value;
  if (sourceControlOpen.value) {
    void refreshSourceControl();
  }
}

const projectRoot = computed(() => {
  const cwd = activePane.value?.cwd;
  if (!cwd || cwd === "~") return "~";
  return cwd;
});

async function bootstrap() {
  shells.value = await listShells();
  const preferred =
    shells.value.find((shell) => shell.id === defaultShellId) ?? shells.value[0];
  createTab(preferred?.id ?? defaultShellId);
}

async function closeTab(tabId: string) {
  await closeTabs([tabId]);
}

async function closeTabs(tabIds: string[]) {
  for (const tabId of tabIds) {
    const tab = tabs.value.find((item) => item.id === tabId);
    if (!tab) continue;
    for (const pane of tab.panes) {
      if (pane.sessionId) {
        await killTerminal(pane.sessionId);
      }
    }
    removeTab(tabId);
  }
  if (tabs.value.length === 0) {
    createTab(shells.value[0]?.id ?? defaultShellId);
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
  selectPane(paneId);
}

function onSessionCreated(paneId: string, sessionId: string) {
  if (!sessionId) return;
  setPaneSession(paneId, sessionId);
}

function onSessionEnded(paneId: string) {
  clearPaneSession(paneId);
}

function onKeyDown(event: KeyboardEvent) {
  if (event.ctrlKey && event.key.toLowerCase() === "r") {
    event.preventDefault();
    openSearch();
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
  refreshGitStatus();
  refreshSourceControl();
  gitRefreshToken.value += 1;
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
});
</script>

<template>
  <div class="warp-app relative flex h-full flex-col">
    <TitleBar
      :terminal-sidebar-open="terminalSidebarOpen"
      :tools-open="toolsOpen"
      :source-control-open="sourceControlOpen"
      :git-status="gitStatus"
      @toggle-terminal-sidebar="terminalSidebarOpen = !terminalSidebarOpen"
      @toggle-tools="toolsOpen = !toolsOpen"
      @toggle-source-control="toggleSourceControl"
    />

    <div class="flex min-h-0 flex-1">
      <SidebarRail
        v-if="terminalSidebarOpen"
        :tabs="tabs"
        :active-tab-id="activeTabId"
        :active-pane-id="activePaneId"
        :shells="shells"
        :preferred-shell-id="activePane?.shellId ?? defaultShellId"
        @select="selectTerminal"
        @close="closeTab"
        @close-many="closeTabs"
        @add="createTab"
        @split="splitActiveTabHorizontal"
        @rename-tab="setTabTitle"
        @move-tab="moveTab"
        @color-change="setTabColor"
        @save-profile="onSaveProfile"
        :git-refresh-token="gitRefreshToken"
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
        <SessionHeader :pane="activePane" :shells="shells" />

        <main class="relative flex min-h-0 flex-1 flex-col">
          <HistorySearch
            :open="historyOpen"
            :query="historyQuery"
            :entries="filteredHistory"
            @update:query="(value) => (historyQuery = value)"
            @close="closeSearch"
            @select="insertHistoryEntry"
          />

          <section
            v-for="tab in tabs"
            v-show="tab.id === activeTabId"
            :key="tab.id"
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
              @command-submitted="onCommandSubmitted"
              @focus-pane="selectPane(pane.id)"
            />
          </section>
        </main>

        <StatusBar
          :pane="activePane"
          :shells="shells"
          :git-status="gitStatus"
          :app-version="appVersion"
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
          :history="gitHistory"
          :loading="sourceControlLoading"
          :panel-width="sourceControlWidth"
          @refresh="refreshSourceControl"
          @stage="(paths) => stageGitPaths(paths).then(onGitMutated)"
          @unstage="(paths) => unstageGitPaths(paths).then(onGitMutated)"
          @revert="(paths, untracked) => revertGitPaths(paths, untracked).then(onGitMutated)"
          @commit="(message) => commitGitChanges(message).then(onGitMutated)"
        />
      </div>
    </div>
  </div>
</template>
