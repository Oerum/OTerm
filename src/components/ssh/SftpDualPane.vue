<script setup lang="ts">
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { onBeforeUnmount, onMounted, ref } from "vue";
import SftpFilePane, { type FilePaneEntry } from "./SftpFilePane.vue";

defineProps<{
  localPath: string;
  remotePath: string;
  localEntries: FilePaneEntry[];
  remoteEntries: FilePaneEntry[];
  busy: boolean;
  selectedLocalPath?: string | null;
  selectedRemotePath?: string | null;
}>();

const emit = defineEmits<{
  localNavigate: [path: string];
  remoteNavigate: [path: string];
  localUp: [];
  remoteUp: [];
  localRefresh: [];
  remoteRefresh: [];
  localCreateFolder: [];
  remoteCreateFolder: [];
  remoteUploadPick: [];
  localDelete: [entry: FilePaneEntry];
  remoteDelete: [entry: FilePaneEntry];
  localOpen: [entry: FilePaneEntry];
  remoteOpen: [entry: FilePaneEntry];
  remoteDownload: [entry: FilePaneEntry];
  dropLocalPathsOnRemote: [paths: string[]];
  dropRemoteEntryOnLocal: [entry: FilePaneEntry];
  dropLocalEntryOnRemote: [entry: FilePaneEntry];
  selectLocal: [entry: FilePaneEntry];
  selectRemote: [entry: FilePaneEntry];
}>();

const localPaneRef = ref<HTMLElement | null>(null);
const remotePaneRef = ref<HTMLElement | null>(null);
const osDragTarget = ref<"local" | "remote" | null>(null);

let unlistenDragDrop: (() => void) | null = null;

function pointInRect(x: number, y: number, rect: DOMRect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function paneAt(logicalX: number, logicalY: number): "local" | "remote" | null {
  const remote = remotePaneRef.value?.getBoundingClientRect();
  if (remote && pointInRect(logicalX, logicalY, remote)) return "remote";
  const local = localPaneRef.value?.getBoundingClientRect();
  if (local && pointInRect(logicalX, logicalY, local)) return "local";
  return null;
}

function onLocalDropEntry(entry: FilePaneEntry) {
  if (entry.side === "remote") {
    emit("dropRemoteEntryOnLocal", entry);
  }
}

function onRemoteDropEntry(entry: FilePaneEntry) {
  if (entry.side === "local") {
    emit("dropLocalEntryOnRemote", entry);
  }
}

onMounted(() => {
  void (async () => {
    try {
      const scaleFactor = await getCurrentWindow().scaleFactor();
      unlistenDragDrop = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === "over") {
          const pos = event.payload.position.toLogical(scaleFactor);
          osDragTarget.value = paneAt(pos.x, pos.y);
          return;
        }
        if (event.payload.type === "leave") {
          osDragTarget.value = null;
          return;
        }
        if (event.payload.type === "drop") {
          const pos = event.payload.position.toLogical(scaleFactor);
          const target = paneAt(pos.x, pos.y);
          osDragTarget.value = null;
          if (target === "remote" && event.payload.paths.length) {
            emit("dropLocalPathsOnRemote", event.payload.paths);
          }
        }
      });
    } catch {
      // Drag-drop is optional outside the Tauri webview.
    }
  })();
});

onBeforeUnmount(() => {
  unlistenDragDrop?.();
});
</script>

<template>
  <div class="grid min-h-0 flex-1 grid-cols-1 gap-2 p-3 lg:grid-cols-2">
    <div ref="localPaneRef" class="flex min-h-0 min-w-0">
      <SftpFilePane
        title="Local"
        side="local"
        :path="localPath"
        :entries="localEntries"
        :busy="busy"
        :selected-path="selectedLocalPath"
        :drop-highlight="osDragTarget === 'local'"
        @navigate="emit('localNavigate', $event)"
        @up="emit('localUp')"
        @refresh="emit('localRefresh')"
        @create-folder="emit('localCreateFolder')"
        @delete-entry="emit('localDelete', $event)"
        @open-entry="emit('localOpen', $event)"
        @download-entry="emit('localOpen', $event)"
        @select-entry="emit('selectLocal', $event)"
        @drop-entry="onLocalDropEntry"
      />
    </div>
    <div ref="remotePaneRef" class="flex min-h-0 min-w-0">
      <SftpFilePane
        title="Remote"
        side="remote"
        :path="remotePath"
        :entries="remoteEntries"
        :busy="busy"
        :selected-path="selectedRemotePath"
        :drop-highlight="osDragTarget === 'remote'"
        @navigate="emit('remoteNavigate', $event)"
        @up="emit('remoteUp')"
        @refresh="emit('remoteRefresh')"
        @create-folder="emit('remoteCreateFolder')"
        @upload-pick="emit('remoteUploadPick')"
        @delete-entry="emit('remoteDelete', $event)"
        @download-entry="emit('remoteDownload', $event)"
        @open-entry="emit('remoteOpen', $event)"
        @select-entry="emit('selectRemote', $event)"
        @drop-paths="emit('dropLocalPathsOnRemote', $event)"
        @drop-entry="onRemoteDropEntry"
      />
    </div>
  </div>
</template>
