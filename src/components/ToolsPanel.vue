<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { openPath } from "@tauri-apps/plugin-opener";
import ExplorerContextMenu from "./ExplorerContextMenu.vue";
import { listDirectory, openInVsCode, searchFiles, showShellContextMenu } from "../lib/fsApi";
import type { FsEntry } from "../types/fs";

const MIN_SEARCH_LENGTH = 2;
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

async function loadDirectory(path: string) {
  loading.value = true;
  try {
    explorerPath.value = path;
    entries.value = await listDirectory(path);
  } catch {
    entries.value = [];
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

async function openCurrentDirectoryWith(app: string) {
  openWithMenuOpen.value = false;
  const directory = currentDirectory.value;
  if (!directory) return;

  try {
    if (app === "code") {
      await openInVsCode(directory);
      return;
    }
    await openPath(directory, app);
  } catch (error) {
    console.error("Open With failed:", error);
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
    class="flex w-72 shrink-0 flex-col border-r border-[var(--warp-border)] bg-[var(--warp-sidebar)]"
  >
    <div class="relative flex items-center justify-between border-b border-[var(--warp-border)] px-3 py-2">
      <span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--warp-faint)]">
        Tools
      </span>

      <div class="relative">
        <button
          ref="openWithButtonRef"
          type="button"
          class="no-drag rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--warp-muted)] transition hover:bg-white/5 hover:text-[var(--warp-text)]"
          :class="openWithMenuOpen ? 'bg-white/5 text-[var(--warp-text)]' : ''"
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
          class="no-drag absolute right-0 top-full z-50 mt-1 min-w-[9rem] overflow-hidden rounded-lg border border-[var(--warp-border-strong)] bg-[var(--warp-elevated)] py-1 shadow-xl"
          role="menu"
        >
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--warp-text)] transition hover:bg-white/[0.06]"
            role="menuitem"
            @click="openCurrentDirectoryWith('code')"
          >
            VS Code
          </button>
        </div>
      </div>
    </div>

    <div class="border-b border-[var(--warp-border)] p-3">
      <label class="block text-[10px] uppercase tracking-wide text-[var(--warp-faint)]">
        Search files
      </label>
      <input
        v-model="searchQuery"
        type="search"
        placeholder="Search in current directory..."
        class="no-drag mt-1.5 w-full rounded-lg border border-[var(--warp-border)] bg-[var(--warp-bg)] px-2.5 py-1.5 text-xs text-[var(--warp-text)] outline-none focus:border-[var(--warp-accent)]"
      />
    </div>

    <div v-if="showingSearch" class="min-h-0 flex-1 overflow-y-auto p-2">
      <p v-if="searchLoading" class="px-2 py-2 text-xs text-[var(--warp-faint)]">Searching...</p>
      <p
        v-else-if="searchQuery.trim().length < MIN_SEARCH_LENGTH"
        class="px-2 py-2 text-xs text-[var(--warp-faint)]"
      >
        Type at least {{ MIN_SEARCH_LENGTH }} characters
      </p>
      <p
        v-else-if="searchResults.length === 0"
        class="px-2 py-2 text-xs text-[var(--warp-faint)]"
      >
        No matches
      </p>
      <button
        v-for="entry in searchResults"
        :key="entry.path"
        type="button"
        class="no-drag mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-white/[0.04]"
        @click="openEntry(entry)"
        @contextmenu.prevent="onEntryContextMenu($event, entry)"
      >
        <span
          class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold uppercase"
          :class="entry.isDir ? 'bg-[var(--warp-accent-dim)] text-[var(--warp-accent)]' : 'bg-[var(--warp-elevated)] text-[var(--warp-muted)]'"
        >
          {{ entry.isDir ? "D" : "F" }}
        </span>
        <span class="min-w-0 flex-1 truncate text-[var(--warp-text)]">{{ entry.name }}</span>
      </button>
    </div>

    <div v-else class="flex min-h-0 flex-1 flex-col">
      <div class="flex flex-wrap gap-1 border-b border-[var(--warp-border)] px-2 py-2">
        <button
          v-for="(crumb, index) in breadcrumbs"
          :key="crumb.path"
          type="button"
          class="no-drag truncate rounded px-1.5 py-0.5 text-[11px] text-[var(--warp-muted)] transition hover:bg-white/5 hover:text-[var(--warp-text)]"
          @click="loadDirectory(crumb.path)"
        >
          {{ crumb.label }}<span v-if="index < breadcrumbs.length - 1" class="text-[var(--warp-faint)]"> /</span>
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <p v-if="loading" class="px-2 py-2 text-xs text-[var(--warp-faint)]">Loading...</p>
        <button
          v-for="entry in entries"
          :key="entry.path"
          type="button"
          class="no-drag mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-white/[0.04]"
          @click="openEntry(entry)"
          @contextmenu.prevent="onEntryContextMenu($event, entry)"
        >
          <span
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold uppercase"
            :class="entry.isDir ? 'bg-[var(--warp-accent-dim)] text-[var(--warp-accent)]' : 'bg-[var(--warp-elevated)] text-[var(--warp-muted)]'"
          >
            {{ entry.isDir ? "D" : "F" }}
          </span>
          <span class="truncate text-[var(--warp-text)]">{{ entry.name }}</span>
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
