<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import FileKindIcon from "../FileKindIcon.vue";
import UiGlyph from "../UiGlyph.vue";

export type FilePaneEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified?: string | null;
  side?: "local" | "remote";
};

const props = defineProps<{
  title: string;
  path: string;
  entries: FilePaneEntry[];
  busy: boolean;
  side: "local" | "remote";
  selectedPath?: string | null;
  dropHighlight?: boolean;
}>();

const emit = defineEmits<{
  navigate: [path: string];
  up: [];
  refresh: [];
  createFolder: [];
  uploadPick: [];
  deleteEntry: [entry: FilePaneEntry];
  downloadEntry: [entry: FilePaneEntry];
  openEntry: [entry: FilePaneEntry];
  selectEntry: [entry: FilePaneEntry];
  dropPaths: [paths: string[]];
  dropEntry: [entry: FilePaneEntry];
}>();

const pathEditing = ref(false);
const pathInput = ref("");
const pathInputRef = ref<HTMLInputElement | null>(null);
const dragHighlight = ref(false);
const searchFilter = ref("");
const viewMode = ref<"list" | "grid">("list");

const pathSegments = computed(() => {
  if (!props.path || props.path === ".") return ["."];
  const sep = props.path.includes("\\") ? "\\" : "/";
  if (props.path === sep) return [sep];
  return props.path.split(/[/\\]/).filter(Boolean);
});

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const filteredEntries = computed(() => {
  const q = searchFilter.value.trim().toLowerCase();
  if (!q) return props.entries;
  return props.entries.filter(
    (entry) =>
      entry.name.toLowerCase().includes(q) ||
      entry.path.toLowerCase().includes(q)
  );
});

function goSegment(index: number) {
  const segments = pathSegments.value;
  const sep = props.path.includes("\\") ? "\\" : "/";
  if (props.path.match(/^[A-Za-z]:/)) {
    const drive = props.path.slice(0, 2);
    const rest = segments.slice(0, index + 1).join("\\");
    emit("navigate", index === 0 ? `${drive}\\` : `${drive}\\${rest}`);
    return;
  }
  if (segments[0] === ".") {
    emit("navigate", segments.slice(0, index + 1).join("/") || ".");
    return;
  }
  emit("navigate", `${sep}${segments.slice(0, index + 1).join(sep)}`);
}

function onDragOver(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
  dragHighlight.value = true;
}

function onDragLeave(event: DragEvent) {
  const next = event.relatedTarget as Node | null;
  if (next && (event.currentTarget as Node).contains(next)) return;
  dragHighlight.value = false;
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  dragHighlight.value = false;
  const files = event.dataTransfer?.files;
  if (files?.length) {
    const paths = Array.from(files)
      .map((file) => (file as File & { path?: string }).path ?? file.name)
      .filter(Boolean);
    if (paths.length) emit("dropPaths", paths);
    return;
  }
  const raw = event.dataTransfer?.getData("application/x-oterm-sftp-entry");
  if (raw) {
    try {
      emit("dropEntry", JSON.parse(raw) as FilePaneEntry);
    } catch {
      // ignore malformed drag payload
    }
  }
}

function onEntryDragStart(event: DragEvent, entry: FilePaneEntry) {
  const payload: FilePaneEntry = { ...entry, side: props.side };
  event.dataTransfer?.setData("application/x-oterm-sftp-entry", JSON.stringify(payload));
  event.dataTransfer?.setData("text/plain", entry.path);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
}

async function startPathEdit() {
  if (pathEditing.value || props.busy) return;
  pathInput.value = props.path;
  pathEditing.value = true;
  await nextTick();
  pathInputRef.value?.focus();
  pathInputRef.value?.select();
}

function commitPathEdit() {
  const trimmed = pathInput.value.trim();
  pathEditing.value = false;
  if (trimmed && trimmed !== props.path) {
    emit("navigate", trimmed);
  }
}

function cancelPathEdit() {
  pathEditing.value = false;
}
</script>

<template>
  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col border border-[var(--oterm-border)] bg-[var(--oterm-panel)]/40 rounded-xl transition-all duration-200"
    :class="dropHighlight || dragHighlight ? 'ring-2 ring-[var(--oterm-accent)]/40 border-[var(--oterm-accent)]/55 bg-[var(--oterm-accent-dim)]/5 shadow-[0_0_12px_rgba(0,229,186,0.02)]' : ''"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Pane Header -->
    <div class="flex items-center justify-between border-b border-[var(--oterm-border)] px-4 py-3 bg-[var(--oterm-panel)]/60 rounded-t-xl shrink-0">
      <div class="flex items-center gap-2">
        <span 
          class="h-2 w-2 rounded-full animate-pulse" 
          :class="side === 'local' ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]' : 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.5)]'"
        />
        <h3 class="text-xs font-bold text-white uppercase tracking-wider">{{ title }} Pane</h3>
      </div>
      
      <!-- View Mode Buttons -->
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="p-1 rounded hover:bg-white/5 text-[var(--oterm-muted)] hover:text-white transition"
          :class="viewMode === 'list' ? 'bg-white/10 text-white' : ''"
          title="List view"
          aria-label="List view"
          :aria-pressed="viewMode === 'list'"
          @click="viewMode = 'list'"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
        </button>
        <button
          type="button"
          class="p-1 rounded hover:bg-white/5 text-[var(--oterm-muted)] hover:text-white transition"
          :class="viewMode === 'grid' ? 'bg-white/10 text-white' : ''"
          title="Grid view"
          aria-label="Grid view"
          :aria-pressed="viewMode === 'grid'"
          @click="viewMode = 'grid'"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Navigation & Breadcrumbs Bar -->
    <div class="flex flex-col gap-2 border-b border-[var(--oterm-border)] px-4 py-3 bg-[var(--oterm-panel)]/20 shrink-0">
      <div class="flex items-center gap-1.5 text-xs">
        <button
          type="button"
          class="nav-btn"
          :disabled="busy || path === '.' || path === '/' || /^[A-Za-z]:\\?$/.test(path)"
          title="Up one folder"
          aria-label="Up one folder"
          @click="emit('up')"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
        </button>

        <!-- Dynamic Breadcrumb segments -->
        <div class="flex-1 min-w-0 flex items-center bg-[var(--oterm-bg)]/40 border border-[var(--oterm-border)] rounded-lg px-2.5 py-1.5">
          <template v-if="pathEditing">
            <input
              ref="pathInputRef"
              v-model="pathInput"
              class="w-full bg-transparent text-xs text-white outline-none border-none p-0 font-mono"
              @keydown.enter.prevent="commitPathEdit"
              @keydown.escape.prevent="cancelPathEdit"
              @blur="commitPathEdit"
            />
          </template>
          <template v-else>
            <div
              class="flex min-w-0 flex-1 flex-wrap items-center gap-1 font-mono text-[11px] truncate cursor-pointer select-none"
              title="Double click to edit path string"
              @dblclick="startPathEdit"
            >
              <template v-for="(segment, index) in pathSegments" :key="`${segment}-${index}`">
                <span v-if="index > 0" class="text-[var(--oterm-faint)] flex items-center">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </span>
                <span
                  class="rounded px-1 text-[var(--oterm-muted)] hover:text-white hover:bg-white/5 transition"
                  @click.stop="goSegment(index)"
                >
                  {{ segment }}
                </span>
              </template>
            </div>
          </template>
        </div>
      </div>

      <!-- Action Buttons and Filter Input -->
      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <span class="absolute inset-y-0 left-0 flex items-center pl-2.5 text-[var(--oterm-faint)]">
            <UiGlyph name="search" :size="12" />
          </span>
          <input
            v-model="searchFilter"
            type="search"
            placeholder="Filter folder items..."
            class="w-full rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/30 py-1 pl-8 pr-2.5 text-[10px] text-[var(--oterm-text)] placeholder-[var(--oterm-faint)] outline-none focus:border-[var(--oterm-accent)]/30 transition duration-120"
          />
        </div>
        
        <button
          v-if="side === 'remote'"
          type="button"
          class="pane-action-btn"
          :disabled="busy"
          @click="emit('uploadPick')"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Upload
        </button>
        <button
          type="button"
          class="pane-action-btn"
          :disabled="busy"
          @click="emit('createFolder')"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          New Folder
        </button>
        <button
          type="button"
          class="pane-action-btn"
          :disabled="busy"
          @click="emit('refresh')"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" :class="{ 'animate-spin': busy }">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
          Refresh
        </button>
      </div>
    </div>

    <!-- Active Loading / Transfer State -->
    <div v-if="busy" class="px-4 py-1.5 bg-[var(--oterm-accent)]/5 border-b border-[var(--oterm-accent)]/10 flex items-center gap-2 shrink-0">
      <span class="h-1.5 w-1.5 rounded-full bg-[var(--oterm-accent)] animate-ping" />
      <span class="text-[10px] font-semibold text-[var(--oterm-accent)] font-mono uppercase tracking-wider">SFTP Transport Active...</span>
    </div>

    <!-- File Browser Area -->
    <div class="oterm-scroll min-h-0 flex-1 overflow-auto p-4">
      
      <!-- List View -->
      <div v-if="viewMode === 'list'" class="space-y-1">
        <div
          v-for="entry in filteredEntries"
          :key="entry.path"
          class="flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition-all duration-155 select-none"
          :class="
            selectedPath === entry.path
              ? 'border-[var(--oterm-accent)] bg-[var(--oterm-accent-dim)]/10 shadow-[0_0_8px_rgba(0,229,186,0.03)]'
              : 'border-[var(--oterm-border)] bg-[var(--oterm-panel)]/40 hover:bg-[var(--oterm-panel)]/80 hover:border-[var(--oterm-border-strong)]'
          "
          draggable="true"
          @click="emit('selectEntry', entry)"
          @dragstart="onEntryDragStart($event, entry)"
          @dblclick="emit('openEntry', entry)"
        >
          <!-- Custom Icon based on Type -->
          <div class="shrink-0">
            <FileKindIcon :name="entry.name" :is-dir="entry.isDir" size-class="w-4.5 h-4.5" />
          </div>

          <!-- Name and Path -->
          <div class="min-w-0 flex-1">
            <div class="text-xs font-semibold text-white truncate">{{ entry.name }}</div>
            <div class="text-[9px] text-[var(--oterm-faint)] font-mono truncate mt-0.5" :title="entry.path">{{ entry.path }}</div>
          </div>

          <!-- Size / Type label -->
          <div class="text-[10px] font-mono text-[var(--oterm-muted)] text-right w-20 shrink-0">
            {{ entry.isDir ? "folder" : formatSize(entry.size) }}
          </div>

          <!-- Action buttons (visible on selection/hover) -->
          <div class="flex items-center gap-1.5 shrink-0" @click.stop>
            <button
              v-if="!entry.isDir && side === 'remote'"
              type="button"
              class="entry-action-btn"
              title="Open remote file directly"
              @click="emit('openEntry', entry)"
            >
              Open
            </button>
            <button
              v-if="!entry.isDir"
              type="button"
              class="entry-action-btn"
              :title="side === 'local' ? 'Open local file' : 'Download to local pane folder'"
              @click="emit('downloadEntry', entry)"
            >
              {{ side === "local" ? "Open" : "Get" }}
            </button>
            <button
              type="button"
              class="entry-action-btn entry-action-btn--danger"
              title="Delete item"
              @click="emit('deleteEntry', entry)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <!-- Grid View -->
      <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
        <div
          v-for="entry in filteredEntries"
          :key="entry.path"
          class="flex flex-col items-center justify-center p-3 rounded-xl border cursor-pointer text-center relative select-none hover:translate-y-[-1px] transition duration-150"
          :class="
            selectedPath === entry.path
              ? 'border-[var(--oterm-accent)] bg-[var(--oterm-accent-dim)]/10 shadow-[0_0_10px_rgba(0,229,186,0.03)]'
              : 'border-[var(--oterm-border)] bg-[var(--oterm-panel)]/40 hover:bg-[var(--oterm-panel)]/80 hover:border-[var(--oterm-border-strong)]'
          "
          draggable="true"
          @click="emit('selectEntry', entry)"
          @dragstart="onEntryDragStart($event, entry)"
          @dblclick="emit('openEntry', entry)"
        >
          <div class="mb-2.5 h-10 w-10 flex items-center justify-center rounded-lg bg-white/3">
            <FileKindIcon :name="entry.name" :is-dir="entry.isDir" size-class="w-6 h-6" />
          </div>

          <!-- Label -->
          <div class="w-full text-xs font-semibold text-white truncate px-1" :title="entry.name">
            {{ entry.name }}
          </div>
          <div class="mt-0.5 text-[9px] text-[var(--oterm-muted)] font-mono">
            {{ entry.isDir ? "folder" : formatSize(entry.size) }}
          </div>

          <!-- Mini delete trigger on selected items -->
          <button 
            v-if="selectedPath === entry.path" 
            type="button"
            class="absolute top-1 right-1 h-4 w-4 bg-rose-500/90 text-white rounded-full flex items-center justify-center text-[9px] font-bold hover:bg-rose-600 transition"
            title="Delete this item"
            @click.stop="emit('deleteEntry', entry)"
          >
            ×
          </button>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="filteredEntries.length === 0" class="py-16 text-center text-xs text-[var(--oterm-faint)]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto mb-2 opacity-40">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
          <line x1="2" y1="20" x2="20" y2="2"/>
        </svg>
        Empty Folder / No matches found.
      </div>
    </div>
  </div>
</template>

<style scoped>
.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--oterm-border);
  color: var(--oterm-muted);
  cursor: pointer;
  transition: all 120ms ease;
}

.nav-btn:hover:not(:disabled) {
  color: var(--oterm-text);
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--oterm-border-strong);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.pane-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 10px;
  font-family: var(--oterm-font-ui);
  font-weight: 600;
  color: var(--oterm-muted);
  background: rgba(255, 255, 255, 0.015);
  border: 1px solid var(--oterm-border);
  cursor: pointer;
  transition: all 120ms ease;
}

.pane-action-btn:hover:not(:disabled) {
  color: var(--oterm-text);
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--oterm-border-strong);
}

.pane-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.entry-action-btn {
  padding: 2.5px 6px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 600;
  color: var(--oterm-accent);
  border: 1px solid rgba(0, 229, 186, 0.2);
  background: transparent;
  cursor: pointer;
  transition: all 120ms ease;
}

.entry-action-btn:hover {
  background: rgba(0, 229, 186, 0.08);
  border-color: rgba(0, 229, 186, 0.4);
}

.entry-action-btn--danger {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.2);
}

.entry-action-btn--danger:hover {
  background: rgba(248, 113, 113, 0.08);
  border-color: rgba(248, 113, 113, 0.4);
}
</style>
