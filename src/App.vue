<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import HistorySearch from "./components/HistorySearch.vue";
import SessionHeader from "./components/SessionHeader.vue";
import SidebarRail from "./components/SidebarRail.vue";
import StatusBar from "./components/StatusBar.vue";
import TerminalPane from "./components/TerminalPane.vue";
import TitleBar from "./components/TitleBar.vue";
import ToolsPanel from "./components/ToolsPanel.vue";
import { useGitStatus } from "./composables/useGitStatus";
import { useTerminalHistory } from "./composables/useTerminalHistory";
import { useWorkspace } from "./composables/useWorkspace";
import type { SaveProfileDraft } from "./types/terminal";
import { killTerminal, listShells, writeTerminal } from "./lib/terminalApi";

const appVersion = "0.1.0";

const defaultShellId = "pwsh";
const terminalSidebarOpen = ref(true);
const toolsOpen = ref(false);

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
const { status: gitStatus, refresh: refreshGitStatus } = useGitStatus(activeCwd);

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

watch([terminalSidebarOpen, toolsOpen], () => {
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
      @toggle-terminal-sidebar="terminalSidebarOpen = !terminalSidebarOpen"
      @toggle-tools="toolsOpen = !toolsOpen"
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
          @toggle-terminal-sidebar="terminalSidebarOpen = !terminalSidebarOpen"
          @toggle-tools="toolsOpen = !toolsOpen"
        />
      </div>
    </div>
  </div>
</template>
