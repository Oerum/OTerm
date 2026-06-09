<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { openPath } from "@tauri-apps/plugin-opener";
import ExplorerContextMenu from "./ExplorerContextMenu.vue";
import {
  getToolsDirectoryHints,
  importEnvFile,
  listDirectory,
  openInFileExplorer,
  openInRider,
  openInVisualStudio,
  openInVsCode,
  openInZed,
  searchFiles,
  showShellContextMenu,
} from "../lib/fsApi";
import type { FsEntry, FsToolsDirectoryHints } from "../types/fs";
import riderIcon from "../assets/editors/JetBrains_Rider.svg";
import visualStudioIcon from "../assets/editors/VS2026.svg";
import vscodeIcon from "../assets/editors/vscode.svg";
import zedIcon from "../assets/editors/zed.svg";

const MIN_SEARCH_LENGTH = 2;
const openWithItemClass =
  "flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs text-(--warp-text) transition hover:bg-white/6";
const openWithIconClass =
  "flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-(--warp-bg) ring-1 ring-(--warp-border)";
const openWithIconImageClass = "h-5 w-5 object-contain";
const SEARCH_DEBOUNCE_MS = 300;
const shellMenuAvailable = navigator.userAgent.includes("Windows");

const props = defineProps<{
  rootPath: string;
}>();

const emit = defineEmits<{
  navigate: [path: string, isDir: boolean];
}>();

const explorerPath = ref("");
const entries = ref<FsEntry[]>([]);
const searchQuery = ref("");
const searchResults = ref<FsEntry[]>([]);
const loading = ref(false);
const searchLoading = ref(false);

const searchRoot = computed(() => explorerPath.value || props.rootPath);
const currentDirectory = computed(() => explorerPath.value || props.rootPath);

const openWithMenuOpen = ref(false);
const openWithMenuRef = ref<HTMLElement | null>(null);
const openWithButtonRef = ref<HTMLElement | null>(null);

const directoryHints = ref<FsToolsDirectoryHints | null>(null);
const envImportStatus = ref<string | null>(null);
const envImportLoading = ref(false);

function solutionMenuEntries(
  hints: FsToolsDirectoryHints | null,
  available: boolean,
  prefix: string,
) {
  if (!hints || !available || hints.solutionFiles.length === 0) return [];

  return hints.solutionFiles.map((path) => {
    const normalized = path.replace(/\\/g, "/");
    const name = normalized.split("/").pop() ?? path;
    return { path, label: `${prefix} — ${name}` };
  });
}

const visualStudioSolutionEntries = computed(() =>
  solutionMenuEntries(directoryHints.value, directoryHints.value?.visualStudioAvailable ?? false, "Visual Studio"),
);

const riderSolutionEntries = computed(() =>
  solutionMenuEntries(directoryHints.value, directoryHints.value?.riderAvailable ?? false, "Rider"),
);

const envImportHint = computed(() => directoryHints.value?.envImport ?? null);
const vscodeAvailable = computed(() => directoryHints.value?.vscodeAvailable ?? false);
const zedAvailable = computed(() => directoryHints.value?.zedAvailable ?? false);
const fileExplorerLabel = computed(
  () => directoryHints.value?.fileExplorerLabel ?? "File manager",
);

const breadcrumbs = computed(() => {
  const normalized = explorerPath.value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return [{ label: "Home", path: props.rootPath }];

  const crumbs: { label: string; path: string }[] = [];
  let current = parts[0].includes(":") ? `${parts[0]}\\` : parts[0];
  crumbs.push({ label: parts[0], path: current });

  for (const part of parts.slice(1)) {
    current = current.endsWith("\\") ? `${current}${part}` : `${current}\\${part}`;
    crumbs.push({ label: part, path: current });
  }
  return crumbs;
});

const showingSearch = computed(() => searchQuery.value.trim().length > 0);

async function refreshDirectoryHints(directory: string) {
  try {
    directoryHints.value = await getToolsDirectoryHints(directory);
  } catch {
    directoryHints.value = null;
  }
}

async function loadDirectory(path: string) {
  loading.value = true;
  envImportStatus.value = null;
  try {
    explorerPath.value = path;
    entries.value = await listDirectory(path);
    await refreshDirectoryHints(path);
  } catch {
    entries.value = [];
    directoryHints.value = null;
  } finally {
    loading.value = false;
  }
}

let searchRequestId = 0;
let searchTimer: number | undefined;

async function runSearch() {
  const query = searchQuery.value.trim();
  if (!query) {
    searchResults.value = [];
    searchLoading.value = false;
    return;
  }

  if (query.length < MIN_SEARCH_LENGTH) {
    searchResults.value = [];
    searchLoading.value = false;
    return;
  }

  const requestId = ++searchRequestId;
  searchLoading.value = true;

  try {
    const results = await searchFiles(query, searchRoot.value);
    if (requestId !== searchRequestId) return;
    searchResults.value = results;
  } catch {
    if (requestId !== searchRequestId) return;
    searchResults.value = [];
  } finally {
    if (requestId === searchRequestId) {
      searchLoading.value = false;
    }
  }
}

function scheduleSearch() {
  window.clearTimeout(searchTimer);
  const query = searchQuery.value.trim();

  if (!query) {
    searchRequestId += 1;
    searchResults.value = [];
    searchLoading.value = false;
    return;
  }

  if (query.length < MIN_SEARCH_LENGTH) {
    searchRequestId += 1;
    searchResults.value = [];
    searchLoading.value = false;
    return;
  }

  searchLoading.value = true;
  searchTimer = window.setTimeout(() => {
    void runSearch();
  }, SEARCH_DEBOUNCE_MS);
}

function openEntry(entry: FsEntry) {
  if (entry.isDir) {
    void loadDirectory(entry.path);
    return;
  }
  emit("navigate", entry.path, false);
}

const contextMenu = ref({
  open: false,
  x: 0,
  y: 0,
  screenX: 0,
  screenY: 0,
  entry: null as FsEntry | null,
});

function onEntryContextMenu(event: MouseEvent, entry: FsEntry) {
  event.preventDefault();
  contextMenu.value = {
    open: true,
    x: event.clientX,
    y: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    entry,
  };
}

function closeContextMenu() {
  contextMenu.value.open = false;
  contextMenu.value.entry = null;
}

function cdFromContextMenu() {
  const entry = contextMenu.value.entry;
  if (!entry) return;
  emit("navigate", entry.path, entry.isDir);
  closeContextMenu();
}

async function openShellContextMenu() {
  const entry = contextMenu.value.entry;
  if (!entry) return;
  const { screenX, screenY } = contextMenu.value;
  closeContextMenu();
  try {
    await showShellContextMenu(entry.path, screenX, screenY);
  } catch {
    // Ignore menu dismissal or unsupported platform errors.
  }
}

async function openEntryWithDefaultApp() {
  const entry = contextMenu.value.entry;
  if (!entry || entry.isDir) return;
  closeContextMenu();
  try {
    await openPath(entry.path);
  } catch {
    // Ignore open failures.
  }
}

function toggleOpenWithMenu() {
  openWithMenuOpen.value = !openWithMenuOpen.value;
}

async function openCurrentDirectoryWith(app: "code" | "zed" | "explorer") {
  openWithMenuOpen.value = false;
  const directory = currentDirectory.value;
  if (!directory) return;

  try {
    if (app === "code") {
      await openInVsCode(directory);
      return;
    }
    if (app === "zed") {
      await openInZed(directory);
      return;
    }
    await openInFileExplorer(directory);
  } catch (error) {
    console.error("Open With failed:", error);
  }
}

async function openSolutionWithVisualStudio(solutionPath: string) {
  openWithMenuOpen.value = false;
  try {
    await openInVisualStudio(solutionPath);
  } catch (error) {
    console.error("Open with Visual Studio failed:", error);
  }
}

async function openSolutionWithRider(solutionPath: string) {
  openWithMenuOpen.value = false;
  try {
    await openInRider(solutionPath);
  } catch (error) {
    console.error("Open with Rider failed:", error);
  }
}

async function importEnvFromAncestor() {
  const directory = currentDirectory.value;
  if (!directory || envImportLoading.value) return;

  envImportLoading.value = true;
  envImportStatus.value = null;
  try {
    await importEnvFile(directory);
    envImportStatus.value = "Imported .env";
    await refreshDirectoryHints(directory);
  } catch (error) {
    envImportStatus.value =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Could not import .env";
  } finally {
    envImportLoading.value = false;
  }
}

function onDocumentClick(event: MouseEvent) {
  if (!openWithMenuOpen.value) return;
  const target = event.target as Node | null;
  if (openWithMenuRef.value?.contains(target) || openWithButtonRef.value?.contains(target)) return;
  openWithMenuOpen.value = false;
}

watch(
  () => props.rootPath,
  (path) => {
    searchRequestId += 1;
    searchQuery.value = "";
    searchResults.value = [];
    searchLoading.value = false;
    void loadDirectory(path);
  },
  { immediate: true },
);

watch(searchQuery, scheduleSearch);

onMounted(() => {
  document.addEventListener("mousedown", onDocumentClick);
});

onBeforeUnmount(() => {
  searchRequestId += 1;
  window.clearTimeout(searchTimer);
  document.removeEventListener("mousedown", onDocumentClick);
});
</script>

<template>
  <aside
    class="relative z-10 flex w-72 shrink-0 flex-col bg-(--warp-sidebar)"
  >
    <div class="relative flex items-center justify-between gap-2 border-b border-(--warp-border) px-3 py-2">
      <span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-(--warp-faint)">
        Tools
      </span>

      <div class="flex min-w-0 items-center gap-1">
        <button
          v-if="envImportHint"
          type="button"
          class="no-drag truncate rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-(--warp-muted) transition hover:bg-white/5 hover:text-(--warp-text) disabled:opacity-50"
          :disabled="envImportLoading"
          :title="`Copy from ${envImportHint.sourcePath}`"
          @click="importEnvFromAncestor"
        >
          Import .env
        </button>

        <div class="relative">
          <button
            ref="openWithButtonRef"
            type="button"
            class="no-drag rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-(--warp-muted) transition hover:bg-white/5 hover:text-(--warp-text)"
            :class="openWithMenuOpen ? 'bg-white/5 text-(--warp-text)' : ''"
            title="Open current folder with an external app"
            aria-haspopup="menu"
            :aria-expanded="openWithMenuOpen"
            @click.stop="toggleOpenWithMenu"
          >
            Open With
          </button>

          <div
            v-if="openWithMenuOpen"
            ref="openWithMenuRef"
            class="no-drag absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-lg border border-(--warp-border-strong) bg-(--warp-elevated) p-1 shadow-xl"
            role="menu"
          >
            <button
              type="button"
              :class="openWithItemClass"
              role="menuitem"
              @click="openCurrentDirectoryWith('explorer')"
            >
              <span :class="openWithIconClass" aria-hidden="true">
                <svg
                  class="h-4 w-4 text-(--warp-muted)"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.2"
                  stroke-linejoin="round"
                >
                  <path
                    d="M2.5 5.5h4l1.2-1.5H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V6a.5.5 0 0 1 .5-.5Z"
                  />
                </svg>
              </span>
              <span class="min-w-0 truncate">{{ fileExplorerLabel }}</span>
            </button>

            <button
              v-if="vscodeAvailable"
              type="button"
              :class="openWithItemClass"
              role="menuitem"
              @click="openCurrentDirectoryWith('code')"
            >
              <span :class="openWithIconClass">
                <img :src="vscodeIcon" alt="" :class="openWithIconImageClass" />
              </span>
              <span class="min-w-0 truncate">VS Code</span>
            </button>

            <button
              v-if="zedAvailable"
              type="button"
              :class="openWithItemClass"
              role="menuitem"
              @click="openCurrentDirectoryWith('zed')"
            >
              <span :class="openWithIconClass">
                <img :src="zedIcon" alt="" :class="openWithIconImageClass" />
              </span>
              <span class="min-w-0 truncate">Zed</span>
            </button>

            <button
              v-for="solution in riderSolutionEntries"
              :key="`rider-${solution.path}`"
              type="button"
              :class="openWithItemClass"
              role="menuitem"
              @click="openSolutionWithRider(solution.path)"
            >
              <span :class="openWithIconClass">
                <img :src="riderIcon" alt="" :class="openWithIconImageClass" />
              </span>
              <span class="min-w-0 truncate">{{ solution.label }}</span>
            </button>

            <button
              v-for="solution in visualStudioSolutionEntries"
              :key="`vs-${solution.path}`"
              type="button"
              :class="openWithItemClass"
              role="menuitem"
              @click="openSolutionWithVisualStudio(solution.path)"
            >
              <span :class="openWithIconClass">
                <img :src="visualStudioIcon" alt="" :class="openWithIconImageClass" />
              </span>
              <span class="min-w-0 truncate">{{ solution.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <p
      v-if="envImportStatus"
      class="border-b border-(--warp-border) px-3 py-1.5 text-[10px] text-(--warp-muted)"
    >
      {{ envImportStatus }}
    </p>

    <div class="border-b border-(--warp-border) p-3">
      <label class="block text-[10px] uppercase tracking-wide text-(--warp-faint)">
        Search files
      </label>
      <input
        v-model="searchQuery"
        type="search"
        placeholder="Search in current directory..."
        class="no-drag mt-1.5 w-full rounded-lg border border-(--warp-border) bg-(--warp-bg) px-2.5 py-1.5 text-xs text-(--warp-text) outline-none focus:border-(--warp-accent)"
      />
    </div>

    <div v-if="showingSearch" class="warp-scroll min-h-0 flex-1 overflow-y-auto p-2">
      <p v-if="searchLoading" class="px-2 py-2 text-xs text-(--warp-faint)">Searching...</p>
      <p
        v-else-if="searchQuery.trim().length < MIN_SEARCH_LENGTH"
        class="px-2 py-2 text-xs text-(--warp-faint)"
      >
        Type at least {{ MIN_SEARCH_LENGTH }} characters
      </p>
      <p
        v-else-if="searchResults.length === 0"
        class="px-2 py-2 text-xs text-(--warp-faint)"
      >
        No matches
      </p>
      <button
        v-for="entry in searchResults"
        :key="entry.path"
        type="button"
        class="no-drag mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-white/4"
        @click="openEntry(entry)"
        @contextmenu.prevent="onEntryContextMenu($event, entry)"
      >
        <span
          class="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-(--warp-elevated) text-(--warp-muted)"
        >
          <svg
            v-if="entry.isDir"
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              d="M2.5 5.5h4l1.2-1.5H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V6a.5.5 0 0 1 .5-.5Z"
              stroke-width="1.2"
              stroke-linejoin="round"
            />
          </svg>
          <svg
            v-else
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              d="M4.5 2.5h4.2L11 4.5h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z"
              stroke-width="1.2"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <span class="min-w-0 flex-1 truncate text-(--warp-text)">{{ entry.name }}</span>
      </button>
    </div>

    <div v-else class="flex min-h-0 flex-1 flex-col">
      <div class="flex flex-wrap gap-1 border-b border-(--warp-border) px-2 py-2">
        <button
          v-for="(crumb, index) in breadcrumbs"
          :key="crumb.path"
          type="button"
          class="no-drag truncate rounded px-1.5 py-0.5 text-[11px] text-(--warp-muted) transition hover:bg-white/5 hover:text-(--warp-text)"
          @click="loadDirectory(crumb.path)"
        >
          {{ crumb.label }}<span v-if="index < breadcrumbs.length - 1" class="text-(--warp-faint)"> /</span>
        </button>
      </div>

      <div class="warp-scroll min-h-0 flex-1 overflow-y-auto p-2">
        <p v-if="loading" class="px-2 py-2 text-xs text-(--warp-faint)">Loading...</p>
        <button
          v-for="entry in entries"
          :key="entry.path"
          type="button"
          class="no-drag mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-white/4"
          @click="openEntry(entry)"
          @contextmenu.prevent="onEntryContextMenu($event, entry)"
        >
          <span
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-(--warp-elevated) text-(--warp-muted)"
          >
            <svg
              v-if="entry.isDir"
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                d="M2.5 5.5h4l1.2-1.5H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V6a.5.5 0 0 1 .5-.5Z"
                stroke-width="1.2"
                stroke-linejoin="round"
              />
            </svg>
            <svg
              v-else
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                d="M4.5 2.5h4.2L11 4.5h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z"
                stroke-width="1.2"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <span class="truncate text-(--warp-text)">{{ entry.name }}</span>
        </button>
      </div>
    </div>

    <ExplorerContextMenu
      :open="contextMenu.open"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :entry="contextMenu.entry"
      :shell-menu-available="shellMenuAvailable"
      @close="closeContextMenu"
      @cd="cdFromContextMenu"
      @shell-menu="openShellContextMenu"
      @open="openEntryWithDefaultApp"
    />
  </aside>
</template>
