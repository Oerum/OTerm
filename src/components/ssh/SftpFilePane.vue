<script setup lang="ts">
import { computed, nextTick, ref } from "vue";

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
    class="flex min-h-0 min-w-0 flex-1 flex-col border border-[var(--oterm-border)] bg-[var(--oterm-panel)]/40 transition-colors"
    :class="dropHighlight || dragHighlight ? 'ring-2 ring-[var(--oterm-accent)]/40' : ''"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div class="border-b border-[var(--oterm-border)] px-3 py-2 text-xs font-medium">{{ title }}</div>
    <div class="flex flex-wrap items-center gap-1 border-b border-[var(--oterm-border)] px-3 py-2 text-xs">
      <button
        type="button"
        class="rounded px-1.5 py-0.5 hover:bg-white/5 disabled:opacity-40"
        :disabled="busy || path === '.' || path === '/' || /^[A-Za-z]:\\?$/.test(path)"
        @click="emit('up')"
      >
        Up
      </button>
      <template v-if="pathEditing">
        <input
          ref="pathInputRef"
          v-model="pathInput"
          class="min-w-0 flex-1 rounded border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-0.5 text-xs"
          @keydown.enter.prevent="commitPathEdit"
          @keydown.escape.prevent="cancelPathEdit"
        />
      </template>
      <template v-else>
        <button
          type="button"
          class="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 rounded px-1 py-0.5 text-left hover:bg-white/5 disabled:opacity-50"
          :disabled="busy"
          title="Click to edit path"
          @click="startPathEdit"
        >
          <template v-for="(segment, index) in pathSegments" :key="`${segment}-${index}`">
            <span v-if="index > 0" class="text-[var(--oterm-faint)]">/</span>
            <span
              class="rounded px-1 hover:bg-white/5"
              @click.stop="goSegment(index)"
            >
              {{ segment }}
            </span>
          </template>
        </button>
      </template>
      <button
        v-if="side === 'remote'"
        type="button"
        class="rounded border border-[var(--oterm-border)] px-2 py-0.5 hover:bg-white/5 disabled:opacity-50"
        :disabled="busy"
        @click="emit('uploadPick')"
      >
        Upload
      </button>
      <button
        type="button"
        class="rounded border border-[var(--oterm-border)] px-2 py-0.5 hover:bg-white/5 disabled:opacity-50"
        :disabled="busy"
        @click="emit('createFolder')"
      >
        New folder
      </button>
      <button
        type="button"
        class="rounded border border-[var(--oterm-border)] px-2 py-0.5 hover:bg-white/5 disabled:opacity-50"
        :disabled="busy"
        @click="emit('refresh')"
      >
        Refresh
      </button>
    </div>

    <div class="oterm-scroll min-h-0 flex-1 overflow-auto p-2">
      <div
        v-for="entry in entries"
        :key="entry.path"
        class="mb-1 grid cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-white/[0.02]"
        :class="
          selectedPath === entry.path
            ? 'border-[var(--oterm-accent)]/50 bg-[var(--oterm-accent)]/10'
            : 'border-[var(--oterm-border)] bg-[var(--oterm-panel)]'
        "
        draggable="true"
        @click="emit('selectEntry', entry)"
        @dragstart="onEntryDragStart($event, entry)"
        @dblclick="emit('openEntry', entry)"
      >
        <div class="min-w-0">
          <div class="truncate font-medium">{{ entry.isDir ? "📁" : "📄" }} {{ entry.name }}</div>
          <div class="truncate text-[10px] text-[var(--oterm-muted)]">{{ entry.path }}</div>
        </div>
        <div class="text-xs text-[var(--oterm-muted)]">
          {{ entry.isDir ? "folder" : formatSize(entry.size) }}
        </div>
        <div class="flex items-center gap-1" @click.stop>
          <button
            v-if="!entry.isDir && side === 'remote'"
            type="button"
            class="rounded border border-[var(--oterm-accent)]/40 px-2 py-0.5 text-xs text-[var(--oterm-accent)] hover:bg-[var(--oterm-accent)]/10"
            @click="emit('openEntry', entry)"
          >
            Open
          </button>
          <button
            v-if="!entry.isDir"
            type="button"
            class="rounded border border-[var(--oterm-accent)]/40 px-2 py-0.5 text-xs text-[var(--oterm-accent)] hover:bg-[var(--oterm-accent)]/10"
            @click="emit('downloadEntry', entry)"
          >
            {{ side === "local" ? "Open" : "Download" }}
          </button>
          <button
            type="button"
            class="rounded border border-[var(--oterm-danger)]/40 px-2 py-0.5 text-xs text-[var(--oterm-danger)] hover:bg-[var(--oterm-danger)]/10"
            @click="emit('deleteEntry', entry)"
          >
            Delete
          </button>
        </div>
      </div>
      <p v-if="entries.length === 0" class="py-8 text-center text-sm text-[var(--oterm-muted)]">
        This folder is empty.
      </p>
    </div>
  </div>
</template>
