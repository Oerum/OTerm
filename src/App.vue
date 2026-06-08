<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import HistorySearch from "./components/HistorySearch.vue";
import SessionHeader from "./components/SessionHeader.vue";
import SidebarRail from "./components/SidebarRail.vue";
import StatusBar from "./components/StatusBar.vue";
import TerminalPane from "./components/TerminalPane.vue";
import TitleBar from "./components/TitleBar.vue";
import ToolsPanel from "./components/ToolsPanel.vue";
import { useTerminalHistory } from "./composables/useTerminalHistory";
import { useWorkspace } from "./composables/useWorkspace";
import { killTerminal, listShells, writeTerminal } from "./lib/terminalApi";

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
  const tab = tabs.value.find((item) => item.id === tabId);
  if (!tab) return;
  for (const pane of tab.panes) {
    if (pane.sessionId) {
      await killTerminal(pane.sessionId);
    }
  }
  removeTab(tabId);
  if (tabs.value.length === 0) {
    createTab(shells.value[0]?.id ?? defaultShellId);
  }
}

function selectTerminal(tabId: string, paneId: string) {
  selectTab(tabId);
  selectPane(paneId);
}

function onSessionCreated(paneId: string, sessionId: string) {
  if (!sessionId) return;
  setPaneSession(paneId, sessionId);
}

async function onSessionEnded(paneId: string) {
  const pane = tabs.value.flatMap((tab) => tab.panes).find((item) => item.id === paneId);
  if (pane?.sessionId) {
    await killTerminal(pane.sessionId).catch(() => undefined);
  }
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

async function insertHistoryEntry(entry: string) {
  closeSearch();
  const pane = activePane.value;
  if (!pane?.sessionId) return;
  await writeTerminal(pane.sessionId, `${entry}\r`);
  addEntry(entry);
}

async function openPathInTerminal(path: string) {
  const pane = activePane.value;
  if (!pane?.sessionId) return;
  const command =
    pane.shellId === "cmd"
      ? `cd /d "${path}"\r`
      : `Set-Location -LiteralPath '${path.replace(/'/g, "''")}'\r`;
  await writeTerminal(pane.sessionId, command);
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
        @add="createTab"
        @split="splitActiveTabHorizontal"
      />

      <ToolsPanel
        v-if="toolsOpen"
        :root-path="projectRoot"
        @navigate="cdFromExplorer"
      />

      <div class="relative flex min-w-0 flex-1 flex-col">
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
              @command-submitted="addEntry"
              @focus-pane="selectPane(pane.id)"
            />
          </section>
        </main>

        <StatusBar :pane="activePane" :shells="shells" />
      </div>
    </div>
  </div>
</template>
