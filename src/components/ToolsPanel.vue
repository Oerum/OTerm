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
import { getSetting, setSetting } from "../lib/settingsStore";
import type { FsEntry, FsToolsDirectoryHints } from "../types/fs";
import riderIcon from "../assets/editors/JetBrains_Rider.svg";
import visualStudioIcon from "../assets/editors/VS2026.svg";
import vscodeIcon from "../assets/editors/vscode.svg";
import zedIcon from "../assets/editors/zed.svg";

const MIN_SEARCH_LENGTH = 2;
const openWithItemClass =
  "flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs text-(--oterm-text) transition hover:bg-white/6";
const openWithIconClass =
  "flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-(--oterm-bg) ring-1 ring-(--oterm-border)";
const openWithIconImageClass = "h-5 w-5 object-contain";
const SEARCH_DEBOUNCE_MS = 300;
const shellMenuAvailable = navigator.userAgent.includes("Windows");
const SHOW_HIDDEN_KEY = "oterm:tools-show-hidden";

function loadShowHidden(): boolean {
  const raw = getSetting(SHOW_HIDDEN_KEY);
  if (raw === null) return true;
  return raw === "1";
}

const showHidden = ref(loadShowHidden());

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
    entries.value = await listDirectory(path, showHidden.value);
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
    const results = await searchFiles(query, searchRoot.value, showHidden.value);
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

function getFileExtension(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function getFileType(name: string, isDir: boolean) {
  if (isDir) return "dir";
  const ext = getFileExtension(name);
  if (["zip", "tar", "gz", "tgz", "rar", "7z", "bz2", "xz"].includes(ext)) {
    return "archive";
  }
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "mp4", "mkv", "mov", "avi"].includes(ext)) {
    return "media";
  }
  if (["js", "ts", "json", "py", "rs", "go", "c", "cpp", "h", "cs", "java", "sh", "bat", "ps1", "html", "css", "yaml", "yml", "toml", "md", "vue"].includes(ext)) {
    return "code";
  }
  return "file";
}

function toggleShowHidden() {
  showHidden.value = !showHidden.value;
  void setSetting(SHOW_HIDDEN_KEY, showHidden.value ? "1" : "0");
}

function isDotHidden(name: string) {
  return name.startsWith(".");
}

watch(showHidden, () => {
  if (explorerPath.value) {
    void loadDirectory(explorerPath.value);
  }
  if (searchQuery.value.trim()) {
    void runSearch();
  }
});

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
    class="relative z-10 flex w-72 shrink-0 flex-col bg-(--oterm-sidebar) border-r border-(--oterm-border)"
  >
    <!-- Header -->
    <div class="relative flex items-center justify-between gap-2 border-b border-(--oterm-border) px-4 py-3 bg-[var(--oterm-panel)]/30 shrink-0">
      <span class="text-[10px] font-bold uppercase tracking-[0.15em] text-(--oterm-faint)">
        Workspace Tools
      </span>

      <div class="flex min-w-0 items-center gap-1.5">
        <button
          v-if="envImportHint"
          type="button"
          class="no-drag header-tool-btn"
          :disabled="envImportLoading"
          :title="`Copy from ${envImportHint.sourcePath}`"
          @click="importEnvFromAncestor"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Import .env
        </button>

        <button
          type="button"
          class="no-drag header-tool-icon-btn"
          :class="showHidden ? 'bg-white/10 text-white border-white/20' : ''"
          title="Show dot-prefixed hidden files and folders"
          @click="toggleShowHidden"
        >
          <svg v-if="showHidden" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
            <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
            <line x1="2" x2="22" y1="2" y2="22"/>
          </svg>
        </button>

        <div class="relative">
          <button
            ref="openWithButtonRef"
            type="button"
            class="no-drag header-tool-btn"
            :class="openWithMenuOpen ? 'bg-white/10 text-white border-white/20' : ''"
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
            class="no-drag absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-lg border border-(--oterm-border-strong) bg-(--oterm-elevated) p-1 shadow-xl"
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
                  class="h-4 w-4 text-(--oterm-muted)"
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

    <!-- Env status notification -->
    <p
      v-if="envImportStatus"
      class="border-b border-(--oterm-border) px-4 py-1.5 text-[10px] text-emerald-400 font-semibold bg-emerald-500/5 flex items-center gap-1.5 shrink-0"
    >
      <span class="h-1 w-1 rounded-full bg-emerald-400" />
      {{ envImportStatus }}
    </p>

    <!-- Search Files Bar -->
    <div class="border-b border-(--oterm-border) p-4 shrink-0 bg-[var(--oterm-panel)]/10">
      <label class="block text-[9px] uppercase tracking-widest font-bold text-(--oterm-faint)">
        Search Files
      </label>
      <div class="relative mt-1.5">
        <span class="absolute inset-y-0 left-0 flex items-center pl-2.5 text-[var(--oterm-faint)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </span>
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Filter workspace files..."
          class="no-drag w-full rounded-lg border border-(--oterm-border) bg-(--oterm-bg)/60 py-1.5 pl-8 pr-2.5 text-xs text-(--oterm-text) placeholder-[var(--oterm-faint)] outline-none focus:border-[var(--oterm-accent)]/30 focus:ring-1 focus:ring-[var(--oterm-accent)]/15 transition duration-150"
        />
        <button 
          v-if="searchQuery" 
          type="button" 
          class="absolute inset-y-0 right-0 flex items-center pr-2 text-[var(--oterm-faint)] hover:text-white"
          @click="searchQuery = ''"
        >
          ×
        </button>
      </div>
    </div>

    <!-- Search Results View -->
    <div v-if="showingSearch" class="oterm-scroll min-h-0 flex-1 overflow-y-auto p-3 space-y-0.5 bg-[var(--oterm-panel)]/5">
      <p v-if="searchLoading" class="px-2 py-2 text-xs text-(--oterm-faint) flex items-center gap-1.5">
        <span class="h-1.5 w-1.5 rounded-full bg-[var(--oterm-accent)] animate-ping" />
        Searching...
      </p>
      <p
        v-else-if="searchQuery.trim().length < MIN_SEARCH_LENGTH"
        class="px-2 py-2 text-xs text-(--oterm-faint)"
      >
        Type at least {{ MIN_SEARCH_LENGTH }} characters
      </p>
      <p
        v-else-if="searchResults.length === 0"
        class="px-2 py-2 text-xs text-(--oterm-faint)"
      >
        No matches found.
      </p>
      
      <button
        v-for="entry in searchResults"
        :key="entry.path"
        type="button"
        class="no-drag flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-1.5 text-left text-xs transition duration-150"
        :class="`hover:bg-white/4 hover:border-[var(--oterm-border)]`"
        @click="openEntry(entry)"
        @contextmenu.prevent="onEntryContextMenu($event, entry)"
      >
        <!-- Icon -->
        <span class="shrink-0 flex items-center justify-center">
          <svg v-if="getFileType(entry.name, entry.isDir) === 'dir'" class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
          </svg>
          <svg v-else-if="getFileType(entry.name, entry.isDir) === 'archive'" class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="12" y1="3" x2="12" y2="21"/>
            <path d="M12 7h3M9 11h6M9 15h3"/>
          </svg>
          <svg v-else-if="getFileType(entry.name, entry.isDir) === 'media'" class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <svg v-else-if="getFileType(entry.name, entry.isDir) === 'code'" class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
            <polyline points="16 18 22 12 16 6"/>
            <polyline points="8 6 2 12 8 18"/>
          </svg>
          <svg v-else class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </span>
        <span class="min-w-0 flex-1 truncate font-medium" :class="isDotHidden(entry.name) ? 'text-white/60' : 'text-white/90'">{{ entry.name }}</span>
      </button>
    </div>

    <!-- Active directory explorer view -->
    <div v-else class="flex min-h-0 flex-1 flex-col">
      <!-- Breadcrumbs Bar -->
      <div class="flex items-center gap-1 border-b border-(--oterm-border) px-3 py-2 bg-[var(--oterm-panel)]/30 overflow-x-auto oterm-scroll shrink-0">
        <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path">
          <span v-if="index > 0" class="text-(--oterm-faint) flex items-center shrink-0">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </span>
          <button
            type="button"
            class="no-drag truncate rounded px-1.5 py-0.5 text-[10px] font-semibold text-(--oterm-muted) transition hover:bg-white/5 hover:text-white shrink-0"
            @click="loadDirectory(crumb.path)"
          >
            {{ crumb.label }}
          </button>
        </template>
      </div>

      <!-- Directories/Files List -->
      <div class="oterm-scroll min-h-0 flex-1 overflow-y-auto p-3 space-y-0.5">
        <p v-if="loading" class="px-2 py-2 text-xs text-(--oterm-faint) flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 rounded-full bg-[var(--oterm-accent)] animate-ping" />
          Loading directory...
        </p>
        
        <button
          v-for="entry in entries"
          :key="entry.path"
          type="button"
          class="no-drag flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-1.5 text-left text-xs transition duration-150"
          :class="`hover:bg-white/4 hover:border-[var(--oterm-border)]`"
          @click="openEntry(entry)"
          @contextmenu.prevent="onEntryContextMenu($event, entry)"
        >
          <!-- Icon -->
          <span class="shrink-0 flex items-center justify-center">
            <svg v-if="getFileType(entry.name, entry.isDir) === 'dir'" class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
            </svg>
            <svg v-else-if="getFileType(entry.name, entry.isDir) === 'archive'" class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="12" y1="3" x2="12" y2="21"/>
              <path d="M12 7h3M9 11h6M9 15h3"/>
            </svg>
            <svg v-else-if="getFileType(entry.name, entry.isDir) === 'media'" class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <svg v-else-if="getFileType(entry.name, entry.isDir) === 'code'" class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
            <svg v-else class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </span>
          <span class="truncate font-medium" :class="isDotHidden(entry.name) ? 'text-white/60' : 'text-white/90'">{{ entry.name }}</span>
        </button>
        
        <p v-if="entries.length === 0 && !loading" class="py-8 text-center text-xs text-[var(--oterm-muted)]">
          Empty Folder.
        </p>
      </div>
    </div>

    <!-- Context Menu for file/folder actions -->
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

<style scoped>
.header-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-family: var(--oterm-font-ui);
  font-weight: 600;
  color: var(--oterm-muted);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--oterm-border);
  cursor: pointer;
  transition: all 120ms ease;
  user-select: none;
}

.header-tool-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: var(--oterm-muted);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--oterm-border);
  cursor: pointer;
  transition: all 120ms ease;
  user-select: none;
}

.header-tool-icon-btn:hover:not(:disabled) {
  color: var(--oterm-text);
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--oterm-border-strong);
}

.header-tool-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.header-tool-btn:hover:not(:disabled) {
  color: var(--oterm-text);
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--oterm-border-strong);
}

.header-tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
