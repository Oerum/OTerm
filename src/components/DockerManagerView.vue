<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  fetchDockerContainerLogs,
  getDockerSummary,
  pruneDockerUnused,
  removeDockerImage,
  removeDockerNetwork,
  removeDockerVolume,
  runDockerContainerAction,
  type DockerPruneKind,
} from "../lib/dockerApi";
import type {
  DockerContainer,
  DockerContainerAction,
  DockerImage,
  DockerNetwork,
  DockerSummary,
  DockerVolume,
} from "../types/docker";
import ConfirmDialog from "./ConfirmDialog.vue";
import DockerNetworkIcon from "./DockerNetworkIcon.vue";
import PanelHeaderActions from "./PanelHeaderActions.vue";
import TrashActionButton from "./TrashActionButton.vue";
import { pushAppToast } from "../lib/appToast";
import { writeClipboardText } from "../lib/clipboard";
import { useConfirmDialog } from "../composables/useConfirmDialog";

const props = defineProps<{
  active?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  openContainerLogs: [container: DockerContainer];
  openContainerShell: [container: DockerContainer];
}>();

const emptySummary = (): DockerSummary => ({
  info: {
    available: false,
    version: null,
    message: null,
  },
  containers: [],
  images: [],
  volumes: [],
  networks: [],
});

const summary = ref<DockerSummary>(emptySummary());
const loading = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const selectedContainer = ref<DockerContainer | null>(null);
const containerLogs = ref("");
const logsLoading = ref(false);
const { confirmOpen, pendingConfirm, askConfirm, resolveConfirm } = useConfirmDialog();

const activeTab = ref<"containers" | "images" | "volumes" | "networks">("containers");
const searchFilter = ref("");
const isLogsMaximized = ref(false);
const wrapLogs = ref(true);
const logsContainerRef = ref<HTMLPreElement | null>(null);

const activeContainers = computed(() =>
  summary.value.containers.filter((container) => container.state === "running"),
);
const pausedContainers = computed(() =>
  summary.value.containers.filter((container) => container.state === "paused"),
);
const stoppedContainers = computed(() =>
  summary.value.containers.filter(
    (container) => container.state !== "running" && container.state !== "paused",
  ),
);

const inUseImages = computed(() => summary.value.images.filter((image) => image.inUse));
const unusedImages = computed(() => summary.value.images.filter((image) => !image.inUse));

const selectedIsLive = computed(
  () =>
    selectedContainer.value?.state === "running" ||
    selectedContainer.value?.state === "paused",
);

// Filtering lists dynamically
const filteredContainers = computed(() => {
  const q = searchFilter.value.trim().toLowerCase();
  if (!q) return summary.value.containers;
  return summary.value.containers.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.image.toLowerCase().includes(q) ||
      (c.ports && c.ports.toLowerCase().includes(q)),
  );
});

const filteredImages = computed(() => {
  const q = searchFilter.value.trim().toLowerCase();
  if (!q) return summary.value.images;
  return summary.value.images.filter(
    (img) =>
      img.repository.toLowerCase().includes(q) ||
      img.id.toLowerCase().includes(q) ||
      img.tag.toLowerCase().includes(q),
  );
});

const filteredVolumes = computed(() => {
  const q = searchFilter.value.trim().toLowerCase();
  if (!q) return summary.value.volumes;
  return summary.value.volumes.filter(
    (v) =>
      v.name.toLowerCase().includes(q) ||
      v.driver.toLowerCase().includes(q),
  );
});

const filteredNetworks = computed(() => {
  const q = searchFilter.value.trim().toLowerCase();
  if (!q) return summary.value.networks;
  return summary.value.networks.filter(
    (n) =>
      n.name.toLowerCase().includes(q) ||
      n.driver.toLowerCase().includes(q),
  );
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    summary.value = await getDockerSummary();
    if (selectedContainer.value) {
      const match = summary.value.containers.find(
        (container) => container.id === selectedContainer.value?.id,
      );
      selectedContainer.value = match ?? null;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function scrollToBottom() {
  if (logsContainerRef.value) {
    logsContainerRef.value.scrollTop = logsContainerRef.value.scrollHeight;
  }
}

async function loadContainerLogs(container: DockerContainer) {
  logsLoading.value = true;
  try {
    containerLogs.value = await fetchDockerContainerLogs(container.id, 300);
    setTimeout(scrollToBottom, 50);
  } catch (err) {
    containerLogs.value =
      err instanceof Error ? err.message : "Failed to load container logs.";
  } finally {
    logsLoading.value = false;
  }
}

async function runAction(action: () => Promise<void>, successMessage?: string) {
  busy.value = true;
  error.value = null;
  try {
    await action();
    await load();
    if (selectedContainer.value) {
      await loadContainerLogs(selectedContainer.value);
    }
    if (successMessage) {
      pushAppToast(successMessage, "success");
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    pushAppToast(error.value, "error");
  } finally {
    busy.value = false;
  }
}

function pruneUnused(kind: DockerPruneKind, title: string, message: string) {
  askConfirm({
    title,
    message,
    confirmLabel: "Remove unused",
    dangerous: true,
    onConfirm: () => void runAction(() => pruneDockerUnused(kind), `Pruned unused ${kind}`),
  });
}

function pruneAllUnused() {
  pruneUnused(
    "all",
    "Remove all unused resources?",
    "This will prune stopped containers, unused images, unused volumes, and custom networks. This cannot be undone.",
  );
}

function selectContainer(container: DockerContainer) {
  selectedContainer.value = container;
}

function containerAction(container: DockerContainer, action: DockerContainerAction) {
  if (action === "remove") {
    askConfirm({
      title: "Remove container?",
      message: `Remove "${container.name || container.id}"? This cannot be undone.`,
      confirmLabel: "Remove",
      dangerous: true,
      onConfirm: () => void runAction(() => runDockerContainerAction(container.id, action), `Removed container ${container.name}`),
    });
    return;
  }

  const actionLabel = {
    start: "Started",
    stop: "Stopped",
    restart: "Restarted",
    pause: "Paused",
    unpause: "Resumed",
    remove: "Removed",
  }[action] || "Executed action on";

  void runAction(() => runDockerContainerAction(container.id, action), `${actionLabel} container ${container.name}`);
}

function removeImage(image: DockerImage) {
  const label = image.repository === "<none>" ? image.id : `${image.repository}:${image.tag}`;
  askConfirm({
    title: "Remove image?",
    message: `Remove "${label}"? This cannot be undone.`,
    confirmLabel: "Remove",
    dangerous: true,
    onConfirm: () => void runAction(() => removeDockerImage(image.id), `Removed image ${label}`),
  });
}

function removeVolume(volume: DockerVolume) {
  askConfirm({
    title: "Remove volume?",
    message: `Remove "${volume.name}"? Any data in this volume will be lost.`,
    confirmLabel: "Remove",
    dangerous: true,
    onConfirm: () => void runAction(() => removeDockerVolume(volume.name), `Removed volume ${volume.name}`),
  });
}

function removeNetwork(network: DockerNetwork) {
  askConfirm({
    title: "Remove network?",
    message: `Remove "${network.name}"? Containers using this network may be affected.`,
    confirmLabel: "Remove",
    dangerous: true,
    onConfirm: () => void runAction(() => removeDockerNetwork(network.id), `Removed network ${network.name}`),
  });
}

function isDefaultNetwork(network: DockerNetwork) {
  return ["bridge", "host", "none"].includes(network.name);
}

function stateTheme(state: string) {
  const s = state.toLowerCase();
  if (s === "running") {
    return {
      dot: "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)]",
      badge: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
      bg: "hover:border-emerald-500/30",
    };
  }
  if (s === "paused") {
    return {
      dot: "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.7)]",
      badge: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
      bg: "hover:border-amber-500/30",
    };
  }
  if (s === "restarting") {
    return {
      dot: "bg-yellow-400 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.7)]",
      badge: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
      bg: "hover:border-yellow-500/30",
    };
  }
  return {
    dot: "bg-rose-500/80 shadow-[0_0_6px_rgba(244,63,94,0.4)]",
    badge: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
    bg: "hover:border-rose-500/20",
  };
}

function rowClass(container: DockerContainer) {
  const isSelected = selectedContainer.value?.id === container.id;
  const theme = stateTheme(container.state);
  
  if (isSelected) {
    return `border-[var(--oterm-accent)] bg-[var(--oterm-accent-dim)]/10 shadow-[0_0_12px_rgba(0,229,186,0.08)] scale-[1.01] z-10`;
  }
  return `border-[var(--oterm-border)] bg-[var(--oterm-panel)]/40 hover:bg-[var(--oterm-panel)]/80 hover:scale-[1.005] hover:border-[var(--oterm-border-strong)] ${theme.bg}`;
}

function parsePorts(portsStr: string): Array<{ external: string; internal: string; protocol: string }> {
  if (!portsStr) return [];
  const parts = portsStr.split(",");
  const parsed: Array<{ external: string; internal: string; protocol: string }> = [];
  const seen = new Set<string>();
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    if (trimmed.includes("->")) {
      const [extPart, intPart] = trimmed.split("->");
      if (!extPart || !intPart) continue;
      
      const extPortMatch = extPart.match(/:(\d+)$/);
      const extPort = extPortMatch ? extPortMatch[1] : extPart;
      
      const [intPort, proto] = intPart.split("/");
      const key = `${extPort}:${intPort}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parsed.push({
        external: extPort,
        internal: intPort,
        protocol: proto || "tcp",
      });
    } else {
      const [intPort, proto] = trimmed.split("/");
      const key = `:${intPort}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parsed.push({
        external: "",
        internal: intPort,
        protocol: proto || "tcp",
      });
    }
  }
  return parsed;
}

async function copyToClipboard(text: string, typeLabel: string) {
  try {
    await writeClipboardText(text);
    pushAppToast(`${typeLabel} copied to clipboard`, "success");
  } catch (err) {
    pushAppToast(`Failed to copy ${typeLabel.toLowerCase()}`, "error");
  }
}

function copyContainerLogs() {
  if (!containerLogs.value) return;
  void copyToClipboard(containerLogs.value, "Logs");
}

watch(selectedContainer, (container) => {
  containerLogs.value = "";
  if (!container) return;
  void loadContainerLogs(container);
});

onMounted(() => void load());
watch(() => props.active, (isActive) => {
  if (isActive) {
    void load();
  }
});
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col bg-[var(--oterm-bg)] text-[var(--oterm-text)]">
    <!-- Header -->
    <header class="flex shrink-0 items-center gap-4 border-b border-[var(--oterm-border)] px-6 py-4 bg-[var(--oterm-panel)] shadow-sm">
      <div class="flex items-center gap-3 min-w-0">
        <div class="h-9 w-9 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-sky-400">
            <path d="M22 10.8c-.8-.4-1.8-.2-2.3.5c-.2.3-.3.7-.3 1.1c0 .4-.2.7-.5.9c-.3.2-.6.3-1 .3H2c-.6 0-1 .4-1 1c0 1 .4 1.8 1.2 2.7c1.7 2 4.4 3.7 7.8 3.7c4.6 0 8.2-2.3 9.4-6.3c1.3.1 2.5-.5 3-1.6c.4-.9.2-2.1-.4-2.7z" stroke-width="1.5"/>
            <path d="M2 10.5h2v2H2zm3-3h2v2H5zm3 0h2v2H8zm3 0h2v2h-2zm3 0h2v2h-2zm-9 3h2v2H5zm3 0h2v2H8zm3 0h2v2h-2zm3 0h2v2h-2zm3 0h2v2h-2z" fill="currentColor"/>
          </svg>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-base font-bold tracking-tight text-white">Docker Engine</h2>
            <span 
              class="relative flex h-2 w-2 rounded-full"
              v-if="summary.info.available"
            >
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span 
              class="rounded-full px-2.5 py-0.5 text-[10px] font-bold border"
              :class="summary.info.available ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'"
            >
              {{ summary.info.available ? 'Online' : 'Offline' }}
            </span>
          </div>
          <p class="text-[11px] text-[var(--oterm-muted)] font-mono mt-0.5">{{ summary.info.version ?? "Unknown Local Daemon" }}</p>
        </div>
      </div>
      
      <div class="flex-1" />
      
      <PanelHeaderActions :loading="loading" :busy="busy" @refresh="load" @close="emit('close')">
        <button
          type="button"
          class="pr-header-btn hover:border-rose-500/30 hover:bg-rose-500/5 hover:text-rose-400"
          :disabled="loading || busy || !summary.info.available"
          @click="pruneAllUnused"
        >
          Prune System
        </button>
      </PanelHeaderActions>
    </header>

    <p v-if="error" class="px-6 py-3 text-xs text-[var(--oterm-danger)] bg-[var(--oterm-danger)]/5 border-b border-[var(--oterm-danger)]/15 shrink-0 font-medium flex items-center gap-2">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      {{ error }}
    </p>

    <!-- Disconnected placeholder -->
    <div
      v-if="!summary.info.available && !loading"
      class="flex flex-1 items-center justify-center p-8 bg-[var(--oterm-bg)]"
    >
      <div class="max-w-md w-full p-8 rounded-2xl border border-[var(--oterm-border-strong)] bg-[var(--oterm-panel)]/40 backdrop-blur-md shadow-2xl text-center">
        <div class="h-14 w-14 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4 animate-pulse-glow">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-rose-400">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h3 class="font-bold text-lg text-white">Docker Daemon Offline</h3>
        <p class="mt-2 text-xs leading-relaxed text-[var(--oterm-muted)]">
          {{ summary.info.message ?? "We couldn't establish a connection to your local Docker socket. Make sure Docker Desktop is started, or verify the daemon permissions." }}
        </p>
        <div class="mt-6 flex justify-center gap-3">
          <button
            type="button"
            class="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--oterm-accent)] text-[var(--oterm-bg)] hover:opacity-90 transition duration-150"
            @click="load"
          >
            Retry Connection
          </button>
        </div>
      </div>
    </div>

    <!-- Active Connected Content -->
    <template v-else>
      <!-- Tabs / Category Metrics Cards -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 p-6 shrink-0 bg-[var(--oterm-panel)]/10 border-b border-[var(--oterm-border)]">
        <!-- Containers Card -->
        <button
          type="button"
          class="tab-metric-card"
          :class="{ 'tab-metric-card--active-emerald': activeTab === 'containers' }"
          @click="activeTab = 'containers'"
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wider text-[var(--oterm-muted)]">Containers</span>
            <div class="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
            </div>
          </div>
          <div class="mt-1 text-2xl font-black text-white text-left">{{ summary.containers.length }}</div>
          <div class="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--oterm-faint)] text-left font-mono">
            <span class="text-emerald-400 font-semibold">{{ activeContainers.length }} active</span>
            <span v-if="pausedContainers.length > 0" class="text-amber-400 font-semibold">· {{ pausedContainers.length }} paused</span>
            <span>·</span>
            <span>{{ stoppedContainers.length }} idle</span>
          </div>
        </button>

        <!-- Images Card -->
        <button
          type="button"
          class="tab-metric-card"
          :class="{ 'tab-metric-card--active-indigo': activeTab === 'images' }"
          @click="activeTab = 'images'"
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wider text-[var(--oterm-muted)]">Images</span>
            <div class="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-indigo-400">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                <polyline points="2 17 12 22 22 17"/>
                <polyline points="2 12 12 17 22 12"/>
              </svg>
            </div>
          </div>
          <div class="mt-1 text-2xl font-black text-white text-left">{{ summary.images.length }}</div>
          <div class="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--oterm-faint)] text-left font-mono">
            <span class="text-indigo-400 font-semibold">{{ inUseImages.length }} used</span>
            <span>·</span>
            <span>{{ unusedImages.length }} unused</span>
          </div>
        </button>

        <!-- Volumes Card -->
        <button
          type="button"
          class="tab-metric-card"
          :class="{ 'tab-metric-card--active-purple': activeTab === 'volumes' }"
          @click="activeTab = 'volumes'"
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wider text-[var(--oterm-muted)]">Volumes</span>
            <div class="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-purple-400">
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>
              </svg>
            </div>
          </div>
          <div class="mt-1 text-2xl font-black text-white text-left">{{ summary.volumes.length }}</div>
          <div class="mt-2 text-[10px] text-[var(--oterm-faint)] text-left">Persistent storage volumes</div>
        </button>

        <!-- Networks Card -->
        <button
          type="button"
          class="tab-metric-card"
          :class="{ 'tab-metric-card--active-amber': activeTab === 'networks' }"
          @click="activeTab = 'networks'"
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wider text-[var(--oterm-muted)]">Networks</span>
            <div class="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <DockerNetworkIcon />
            </div>
          </div>
          <div class="mt-1 text-2xl font-black text-white text-left">{{ summary.networks.length }}</div>
          <div class="mt-2 text-[10px] text-[var(--oterm-faint)] text-left">Virtual interface drivers</div>
        </button>
      </div>

      <!-- Search Filter Bar -->
      <div class="flex items-center gap-3 px-6 py-3 border-b border-[var(--oterm-border)] bg-[var(--oterm-panel)]/20 shrink-0">
        <div class="relative flex-1 max-w-md">
          <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--oterm-faint)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <input
            v-model="searchFilter"
            type="search"
            :placeholder="`Filter ${activeTab} by name, image, tags, id…`"
            class="w-full rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/60 py-2 pl-9 pr-3 text-xs text-[var(--oterm-text)] placeholder-[var(--oterm-faint)] outline-none focus:border-[var(--oterm-accent)]/40 focus:ring-1 focus:ring-[var(--oterm-accent)]/15 transition duration-150"
          />
        </div>
        <div class="flex-1" />
        
        <!-- Tab-specific prune actions -->
        <button
          v-if="activeTab === 'containers' && stoppedContainers.length"
          type="button"
          class="pr-tab-action-btn"
          :disabled="busy"
          @click="pruneUnused('containers', 'Prune Stopped Containers', 'Delete all stopped Docker containers?')"
        >
          Prune Stopped ({{ stoppedContainers.length }})
        </button>
        <button
          v-if="activeTab === 'images' && unusedImages.length"
          type="button"
          class="pr-tab-action-btn"
          :disabled="busy"
          @click="pruneUnused('images', 'Prune Unused Images', 'Delete all dangling and unreferenced Docker images?')"
        >
          Prune Unused ({{ unusedImages.length }})
        </button>
        <button
          v-if="activeTab === 'volumes' && summary.volumes.length"
          type="button"
          class="pr-tab-action-btn"
          :disabled="busy"
          @click="pruneUnused('volumes', 'Prune Unused Volumes', 'Delete all persistent volumes not referenced by any container?')"
        >
          Prune Volumes
        </button>
        <button
          v-if="activeTab === 'networks' && summary.networks.length"
          type="button"
          class="pr-tab-action-btn"
          :disabled="busy"
          @click="pruneUnused('networks', 'Prune Custom Networks', 'Delete all unused network bridges?')"
        >
          Prune Networks
        </button>
      </div>

      <!-- Tab Content Area -->
      <div class="flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--oterm-panel)]/5">
        
        <!-- Containers Tab -->
        <div v-if="activeTab === 'containers'" class="p-6 space-y-3 overflow-y-auto flex-1 oterm-scroll">
          <div v-if="filteredContainers.length === 0" class="text-xs text-[var(--oterm-faint)] text-center py-16">
            No containers found matching query.
          </div>
          <div
            v-for="container in filteredContainers"
            :key="container.id"
            class="docker-card flex items-center gap-4 rounded-xl border p-4 cursor-pointer"
            :class="rowClass(container)"
            @click="selectContainer(container)"
          >
            <!-- Glowing status indicator dot & pulse ring -->
            <span class="shrink-0 flex items-center justify-center relative w-6 h-6">
              <span 
                class="h-3 w-3 rounded-full shrink-0 relative z-10"
                :class="stateTheme(container.state).dot"
              />
              <span v-if="container.state.toLowerCase() === 'running'" class="absolute h-6 w-6 rounded-full bg-emerald-500/20 animate-pulse-ring" />
            </span>

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2.5 flex-wrap">
                <span class="font-bold text-sm text-white truncate max-w-[260px]" :title="container.name">{{ container.name }}</span>
                <span 
                  class="font-mono text-[10px] text-[var(--oterm-faint)] bg-white/5 border border-white/5 px-1.5 py-0.5 rounded cursor-pointer hover:bg-white/10 active:bg-white/15 transition" 
                  title="Click to copy full ID"
                  @click.stop="copyToClipboard(container.id, 'Container ID')"
                >
                  {{ container.id.slice(0, 12) }}
                </span>
                <span 
                  class="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border"
                  :class="stateTheme(container.state).badge"
                >
                  {{ container.state }}
                </span>
              </div>
              <div class="mt-1.5 flex items-center gap-2 text-xs text-[var(--oterm-muted)] font-mono flex-wrap">
                <span class="text-sky-400 bg-sky-500/5 border border-sky-500/10 px-1.5 py-0.5 rounded" :title="container.image">{{ container.image }}</span>
                <span class="text-[var(--oterm-faint)]">·</span>
                <span class="flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {{ container.status }}
                </span>
              </div>
              <!-- Ports badging -->
              <div v-if="parsePorts(container.ports).length > 0" class="mt-2.5 flex items-center gap-1.5 flex-wrap">
                <span 
                  v-for="port in parsePorts(container.ports)" 
                  :key="port.external + port.internal"
                  class="inline-flex items-center gap-1 text-[10px] font-bold font-mono bg-emerald-500/5 text-emerald-400 border border-emerald-500/10 px-1.5 py-0.5 rounded hover:bg-emerald-500/10 cursor-pointer"
                  title="Click to copy Port Map"
                  @click.stop="copyToClipboard(port.external ? `${port.external}:${port.internal}` : port.internal, 'Port configuration')"
                >
                  <span v-if="port.external" class="text-white">{{ port.external }}</span>
                  <span v-if="port.external" class="text-emerald-500/60">→</span>
                  <span>{{ port.internal }}</span>
                  <span class="text-[8px] text-emerald-500/40 uppercase">{{ port.protocol }}</span>
                </span>
              </div>
            </div>

            <!-- Actions Bar with pretty hover states & SVG icons -->
            <div class="flex items-center gap-1.5 shrink-0" @click.stop>
              <!-- Running actions -->
              <button
                v-if="container.state.toLowerCase() === 'running'"
                type="button"
                class="action-icon-btn action-icon-btn--sky"
                title="Open Interactive Shell"
                @click="emit('openContainerShell', container)"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              </button>
              <button
                v-if="container.state.toLowerCase() === 'running'"
                type="button"
                class="action-icon-btn action-icon-btn--emerald"
                title="Follow Streaming Logs"
                @click="emit('openContainerLogs', container)"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </button>
              <button
                v-if="container.state.toLowerCase() === 'running'"
                type="button"
                class="action-icon-btn action-icon-btn--amber"
                title="Pause Container"
                :disabled="busy"
                @click="containerAction(container, 'pause')"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              </button>
              <button
                v-if="container.state.toLowerCase() === 'running'"
                type="button"
                class="action-icon-btn action-icon-btn--amber"
                title="Restart Container"
                :disabled="busy"
                @click="containerAction(container, 'restart')"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
              </button>

              <!-- Paused actions -->
              <button
                v-if="container.state.toLowerCase() === 'paused'"
                type="button"
                class="action-icon-btn action-icon-btn--emerald"
                title="Resume Container"
                :disabled="busy"
                @click="containerAction(container, 'unpause')"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5">
                  <path d="M5 3l14 9-14 9V3z" />
                </svg>
              </button>
              <button
                v-if="container.state.toLowerCase() === 'running' || container.state.toLowerCase() === 'paused'"
                type="button"
                class="action-icon-btn action-icon-btn--rose"
                title="Stop Container"
                :disabled="busy"
                @click="containerAction(container, 'stop')"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>

              <!-- Stopped actions -->
              <button
                v-if="container.state.toLowerCase() !== 'running' && container.state.toLowerCase() !== 'paused'"
                type="button"
                class="action-icon-btn action-icon-btn--emerald"
                title="Start Container"
                :disabled="busy"
                @click="containerAction(container, 'start')"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5">
                  <path d="M5 3l14 9-14 9V3z" />
                </svg>
              </button>
              <TrashActionButton
                v-if="container.state.toLowerCase() !== 'running' && container.state.toLowerCase() !== 'paused'"
                title="Remove Container"
                extra-class="action-icon-btn--rose"
                :disabled="busy"
                @click="containerAction(container, 'remove')"
              />
            </div>
          </div>
        </div>

        <!-- Images Tab -->
        <div v-if="activeTab === 'images'" class="p-6 space-y-3 overflow-y-auto flex-1 oterm-scroll">
          <div v-if="filteredImages.length === 0" class="text-xs text-[var(--oterm-faint)] text-center py-16">
            No images found matching query.
          </div>
          <div
            v-for="image in filteredImages"
            :key="image.id + image.repository + image.tag"
            class="docker-card flex items-center gap-4 rounded-xl border border-[var(--oterm-border)] bg-[var(--oterm-panel)]/40 p-4 hover:border-indigo-500/20"
          >
            <div class="h-9 w-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-indigo-400">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                <polyline points="2 17 12 22 22 17"/>
                <polyline points="2 12 12 17 22 12"/>
              </svg>
            </div>
            
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-sm text-white truncate max-w-[280px]">
                  {{ image.repository }}<span class="text-indigo-300 font-semibold">:{{ image.tag }}</span>
                </span>
                <span 
                  v-if="image.inUse" 
                  class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              </div>
              <div class="mt-1.5 flex items-center gap-2 text-xs text-[var(--oterm-muted)] font-mono flex-wrap">
                <span 
                  class="text-[var(--oterm-faint)] cursor-pointer hover:text-white transition" 
                  title="Click to copy Image ID"
                  @click.stop="copyToClipboard(image.id, 'Image ID')"
                >
                  {{ image.id.slice(0, 19) }}
                </span>
                <span>·</span>
                <span>Size: {{ image.size }}</span>
                <span>·</span>
                <span>Created: {{ image.createdSince }}</span>
              </div>
            </div>

            <div class="shrink-0">
              <TrashActionButton
                title="Remove Image"
                :extra-class="image.inUse ? 'action-icon-btn--rose opacity-30 cursor-not-allowed' : 'action-icon-btn--rose'"
                :disabled="busy || image.inUse"
                @click="removeImage(image)"
              />
            </div>
          </div>
        </div>

        <!-- Volumes Tab -->
        <div v-if="activeTab === 'volumes'" class="p-6 space-y-3 overflow-y-auto flex-1 oterm-scroll">
          <div v-if="filteredVolumes.length === 0" class="text-xs text-[var(--oterm-faint)] text-center py-16">
            No volumes found matching query.
          </div>
          <div
            v-for="volume in filteredVolumes"
            :key="volume.name"
            class="docker-card flex items-center gap-4 rounded-xl border border-[var(--oterm-border)] bg-[var(--oterm-panel)]/40 p-4 hover:border-purple-500/20"
          >
            <div class="h-9 w-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-purple-400">
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>
              </svg>
            </div>
            
            <div class="min-w-0 flex-1">
              <div 
                class="font-bold text-sm text-white truncate max-w-[340px] font-mono cursor-pointer hover:text-[var(--oterm-accent)] transition" 
                title="Click to copy volume name"
                @click.stop="copyToClipboard(volume.name, 'Volume Name')"
              >
                {{ volume.name }}
              </div>
              <div class="mt-1.5 flex items-center gap-2 text-xs text-[var(--oterm-muted)] font-mono">
                <span>Driver: {{ volume.driver }}</span>
                <span>·</span>
                <span>Scope: {{ volume.scope }}</span>
              </div>
            </div>

            <div class="shrink-0">
              <TrashActionButton
                title="Remove Volume"
                extra-class="action-icon-btn--rose"
                :disabled="busy"
                @click="removeVolume(volume)"
              />
            </div>
          </div>
        </div>

        <!-- Networks Tab -->
        <div v-if="activeTab === 'networks'" class="p-6 space-y-3 overflow-y-auto flex-1 oterm-scroll">
          <div v-if="filteredNetworks.length === 0" class="text-xs text-[var(--oterm-faint)] text-center py-16">
            No networks found matching query.
          </div>
          <div
            v-for="network in filteredNetworks"
            :key="network.id"
            class="docker-card flex items-center gap-4 rounded-xl border border-[var(--oterm-border)] bg-[var(--oterm-panel)]/40 p-4 hover:border-amber-500/20"
          >
            <div class="h-9 w-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <DockerNetworkIcon :size="18" />
            </div>
            
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2.5 flex-wrap">
                <span class="font-bold text-sm text-white truncate max-w-[280px]">{{ network.name }}</span>
                <span 
                  v-if="isDefaultNetwork(network)" 
                  class="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-white/5 text-[var(--oterm-faint)] border border-white/10"
                >
                  System default
                </span>
              </div>
              <div class="mt-1.5 flex items-center gap-2 text-xs text-[var(--oterm-muted)] font-mono flex-wrap">
                <span>Driver: {{ network.driver }}</span>
                <span>·</span>
                <span>Scope: {{ network.scope }}</span>
                <span>·</span>
                <span 
                  class="text-[var(--oterm-faint)] cursor-pointer hover:text-white transition"
                  title="Click to copy Network ID"
                  @click.stop="copyToClipboard(network.id, 'Network ID')"
                >
                  {{ network.id.slice(0, 12) }}
                </span>
              </div>
            </div>

            <div class="shrink-0">
              <TrashActionButton
                title="Remove Network"
                :extra-class="isDefaultNetwork(network) ? 'opacity-20 cursor-not-allowed' : 'action-icon-btn--rose'"
                :disabled="busy || isDefaultNetwork(network)"
                @click="removeNetwork(network)"
              />
            </div>
          </div>
        </div>

      </div>

      <!-- Selected Container Logs Terminal-style view -->
      <section
        v-if="selectedContainer"
        class="flex shrink-0 flex-col border-t border-[var(--oterm-border)] bg-[#05070c] transition-all duration-200"
        :class="isLogsMaximized ? 'h-[75vh]' : 'h-80'"
      >
        <div class="flex items-center gap-2 border-b border-[var(--oterm-border)] px-6 py-3 bg-[var(--oterm-panel)] shrink-0">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse" />
              <span class="text-xs font-bold text-white truncate">
                Logs: {{ selectedContainer.name }}
              </span>
            </div>
            <div class="truncate text-[10px] text-[var(--oterm-faint)] font-mono mt-0.5">
              {{ selectedContainer.image }} · {{ selectedContainer.state }}
            </div>
          </div>
          
          <div class="flex items-center gap-2">
            <button
              v-if="selectedIsLive"
              type="button"
              class="pr-header-btn px-2.5 py-1 text-[10px]"
              @click="emit('openContainerLogs', selectedContainer)"
            >
              Follow logs
            </button>
            <button
              v-if="selectedContainer.state.toLowerCase() === 'running'"
              type="button"
              class="pr-header-btn px-2.5 py-1 text-[10px]"
              @click="emit('openContainerShell', selectedContainer)"
            >
              Shell
            </button>
            <button
              type="button"
              class="pr-header-btn px-2.5 py-1 text-[10px]"
              @click="copyContainerLogs"
              title="Copy all logs to clipboard"
            >
              Copy logs
            </button>
            <button
              type="button"
              class="pr-header-btn px-2.5 py-1 text-[10px]"
              @click="wrapLogs = !wrapLogs"
            >
              {{ wrapLogs ? 'Unwrap lines' : 'Wrap lines' }}
            </button>
            <button
              type="button"
              class="pr-header-btn px-2.5 py-1 text-[10px]"
              :disabled="logsLoading"
              @click="loadContainerLogs(selectedContainer)"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" :class="{ 'animate-spin': logsLoading }">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              Refresh
            </button>
            
            <div class="h-4 w-[1px] bg-[var(--oterm-border)] mx-1" />

            <button
              type="button"
              class="p-1.5 rounded hover:bg-white/5 text-[var(--oterm-muted)] hover:text-[var(--oterm-text)] transition flex items-center"
              :title="isLogsMaximized ? 'Restore layout' : 'Maximize log view'"
              @click="isLogsMaximized = !isLogsMaximized"
            >
              <svg v-if="isLogsMaximized" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="10" y1="14" x2="3" y2="21" />
              </svg>
              <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
            <button
              type="button"
              class="p-1 rounded hover:bg-white/5 text-[var(--oterm-muted)] hover:text-[var(--oterm-text)] transition text-sm flex items-center justify-center w-6 h-6 font-bold"
              title="Close log viewer"
              @click="selectedContainer = null"
            >
              ×
            </button>
          </div>
        </div>
        
        <pre
          ref="logsContainerRef"
          class="oterm-scroll m-0 min-h-0 flex-1 overflow-auto p-5 font-mono text-[11px] leading-relaxed text-[#d4d4d8]"
          :class="wrapLogs ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'"
        >{{ logsLoading ? "Loading logs…" : containerLogs || "No logs yet." }}</pre>
      </section>
    </template>

    <ConfirmDialog
      :open="confirmOpen"
      :title="pendingConfirm?.title ?? ''"
      :message="pendingConfirm?.message ?? ''"
      :confirm-label="pendingConfirm?.confirmLabel"
      :dangerous="pendingConfirm?.dangerous"
      @confirm="resolveConfirm(true)"
      @cancel="resolveConfirm(false)"
    />
  </div>
</template>

<style scoped>
@keyframes pulse-ring {
  0% {
    transform: scale(0.6);
    opacity: 0.9;
  }
  80%, 100% {
    transform: scale(1.8);
    opacity: 0;
  }
}

@keyframes pulse-glow {
  0%, 100% {
    box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
  }
  50% {
    box-shadow: 0 0 16px rgba(239, 68, 68, 0.7);
  }
}

.animate-pulse-ring {
  animation: pulse-ring 2s cubic-bezier(0.215, 0.610, 0.355, 1) infinite;
}

.animate-pulse-glow {
  animation: pulse-glow 2s infinite;
}

.pr-header-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 11px;
  font-family: var(--oterm-font-ui);
  color: var(--oterm-muted);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--oterm-border);
  cursor: pointer;
  transition: all 150ms ease;
  font-weight: 600;
}

.pr-header-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: var(--oterm-text);
  border-color: var(--oterm-border-strong);
}

.pr-header-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* PaaS/Vercel Metric Card Styles */
.tab-metric-card {
  padding: 16px;
  border-radius: 12px;
  background: rgba(11, 15, 25, 0.4);
  border: 1px solid var(--oterm-border);
  transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(8px);
}

.tab-metric-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: transparent;
  transition: background 250ms ease;
}

.tab-metric-card:hover {
  background: rgba(11, 15, 25, 0.6);
  border-color: var(--oterm-border-strong);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
}

.tab-metric-card--active-emerald {
  border-color: rgba(16, 185, 129, 0.35) !important;
  background: rgba(16, 185, 129, 0.04) !important;
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.03), inset 0 0 12px rgba(16, 185, 129, 0.02) !important;
}
.tab-metric-card--active-emerald::before {
  background: #10b981 !important;
}

.tab-metric-card--active-indigo {
  border-color: rgba(99, 102, 241, 0.35) !important;
  background: rgba(99, 102, 241, 0.04) !important;
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.03), inset 0 0 12px rgba(99, 102, 241, 0.02) !important;
}
.tab-metric-card--active-indigo::before {
  background: #6366f1 !important;
}

.tab-metric-card--active-purple {
  border-color: rgba(168, 85, 247, 0.35) !important;
  background: rgba(168, 85, 247, 0.04) !important;
  box-shadow: 0 8px 24px rgba(168, 85, 247, 0.03), inset 0 0 12px rgba(168, 85, 247, 0.02) !important;
}
.tab-metric-card--active-purple::before {
  background: #a855f7 !important;
}

.tab-metric-card--active-amber {
  border-color: rgba(245, 158, 11, 0.35) !important;
  background: rgba(245, 158, 11, 0.04) !important;
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.03), inset 0 0 12px rgba(245, 158, 11, 0.02) !important;
}
.tab-metric-card--active-amber::before {
  background: #f59e0b !important;
}

/* Docker Cards List */
.docker-card {
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(4px);
}

.docker-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

/* Action Icon Buttons */
.action-icon-btn,
:deep(.action-icon-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: var(--oterm-muted);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--oterm-border);
  cursor: pointer;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.action-icon-btn:hover:not(:disabled),
:deep(.action-icon-btn:hover:not(:disabled)) {
  color: var(--oterm-text);
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--oterm-border-strong);
  transform: translateY(-1px);
}

.action-icon-btn:disabled,
:deep(.action-icon-btn:disabled) {
  opacity: 0.35;
  cursor: not-allowed;
}

.action-icon-btn--emerald:hover:not(:disabled) {
  color: #34d399;
  background: rgba(52, 211, 153, 0.12);
  border-color: rgba(52, 211, 153, 0.3);
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.15);
}

.action-icon-btn--amber:hover:not(:disabled) {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.12);
  border-color: rgba(251, 191, 36, 0.3);
  box-shadow: 0 0 8px rgba(251, 191, 36, 0.15);
}

.action-icon-btn--rose:hover:not(:disabled),
:deep(.action-icon-btn--rose:hover:not(:disabled)) {
  color: #f87171;
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.3);
  box-shadow: 0 0 8px rgba(248, 113, 113, 0.15);
}

.action-icon-btn--sky:hover:not(:disabled) {
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  border-color: rgba(56, 189, 248, 0.3);
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.15);
}

.pr-tab-action-btn {
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  color: #f87171;
  border: 1px solid rgba(248, 113, 113, 0.2);
  background: transparent;
  cursor: pointer;
  transition: all 150ms ease;
}

.pr-tab-action-btn:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.08);
  border-color: rgba(248, 113, 113, 0.4);
  color: #fca5a5;
  box-shadow: 0 0 8px rgba(248, 113, 113, 0.1);
}

.pr-tab-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
