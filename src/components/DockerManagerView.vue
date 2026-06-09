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

type PendingConfirm = {
  title: string;
  message: string;
  confirmLabel?: string;
  dangerous?: boolean;
  onConfirm: () => void;
};

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
const confirmOpen = ref(false);
const pendingConfirm = ref<PendingConfirm | null>(null);

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

const containerGroups = computed(() => [
  { title: "Active", items: activeContainers.value },
  { title: "Paused", items: pausedContainers.value },
  { title: "Stopped", items: stoppedContainers.value },
]);

const imageGroups = computed(() => [
  { title: "In Use", items: inUseImages.value },
  { title: "Not in Use", items: unusedImages.value },
]);

const selectedIsLive = computed(
  () =>
    selectedContainer.value?.state === "running" ||
    selectedContainer.value?.state === "paused",
);

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

async function loadContainerLogs(container: DockerContainer) {
  logsLoading.value = true;
  try {
    containerLogs.value = await fetchDockerContainerLogs(container.id, 300);
  } catch (err) {
    containerLogs.value =
      err instanceof Error ? err.message : "Failed to load container logs.";
  } finally {
    logsLoading.value = false;
  }
}

async function runAction(action: () => Promise<void>) {
  busy.value = true;
  error.value = null;
  try {
    await action();
    await load();
    if (selectedContainer.value) {
      await loadContainerLogs(selectedContainer.value);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

function askConfirm(options: PendingConfirm) {
  pendingConfirm.value = options;
  confirmOpen.value = true;
}

function resolveConfirm(confirmed: boolean) {
  const pending = pendingConfirm.value;
  confirmOpen.value = false;
  pendingConfirm.value = null;
  if (confirmed) pending?.onConfirm();
}

function pruneUnused(kind: DockerPruneKind, title: string, message: string) {
  askConfirm({
    title,
    message,
    confirmLabel: "Remove unused",
    dangerous: true,
    onConfirm: () => void runAction(() => pruneDockerUnused(kind)),
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
      onConfirm: () => void runAction(() => runDockerContainerAction(container.id, action)),
    });
    return;
  }
  void runAction(() => runDockerContainerAction(container.id, action));
}

function removeImage(image: DockerImage) {
  const label = image.repository === "<none>" ? image.id : `${image.repository}:${image.tag}`;
  askConfirm({
    title: "Remove image?",
    message: `Remove "${label}"? This cannot be undone.`,
    confirmLabel: "Remove",
    dangerous: true,
    onConfirm: () => void runAction(() => removeDockerImage(image.id)),
  });
}

function removeVolume(volume: DockerVolume) {
  askConfirm({
    title: "Remove volume?",
    message: `Remove "${volume.name}"? Any data in this volume will be lost.`,
    confirmLabel: "Remove",
    dangerous: true,
    onConfirm: () => void runAction(() => removeDockerVolume(volume.name)),
  });
}

function removeNetwork(network: DockerNetwork) {
  askConfirm({
    title: "Remove network?",
    message: `Remove "${network.name}"? Containers using this network may be affected.`,
    confirmLabel: "Remove",
    dangerous: true,
    onConfirm: () => void runAction(() => removeDockerNetwork(network.id)),
  });
}

function isDefaultNetwork(network: DockerNetwork) {
  return ["bridge", "host", "none"].includes(network.name);
}

function stateClass(state: string) {
  if (state === "running") return "bg-green-500/15 text-green-300";
  if (state === "paused") return "bg-yellow-500/15 text-yellow-300";
  return "bg-white/10 text-[var(--warp-muted)]";
}

function rowClass(container: DockerContainer) {
  return selectedContainer.value?.id === container.id
    ? "border-[var(--warp-accent)]/50 bg-[var(--warp-accent)]/5"
    : "border-[var(--warp-border)] bg-[var(--warp-panel)]";
}

watch(selectedContainer, (container) => {
  containerLogs.value = "";
  if (!container) return;
  void loadContainerLogs(container);
});

onMounted(() => void load());
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col bg-[var(--warp-bg)] text-[var(--warp-text)]">
    <header
      class="flex shrink-0 items-center gap-2 border-b border-[var(--warp-border)] px-4 py-2"
    >
      <h2 class="text-sm font-medium">Docker</h2>
      <span class="truncate text-xs text-[var(--warp-muted)]">
        {{ summary.info.version ?? "Local Docker engine" }}
      </span>
      <div class="flex-1" />
      <button
        type="button"
        class="rounded-md border border-[var(--warp-danger)]/40 px-2 py-1 text-xs text-[var(--warp-danger)] hover:bg-[var(--warp-danger)]/10 disabled:opacity-50"
        :disabled="loading || busy || !summary.info.available"
        @click="pruneAllUnused"
      >
        Remove all unused
      </button>
      <button
        type="button"
        class="rounded-md border border-[var(--warp-border)] px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-50"
        :disabled="loading || busy"
        @click="load"
      >
        Refresh
      </button>
      <button
        type="button"
        class="rounded-md border border-[var(--warp-border)] px-2 py-1 text-xs hover:bg-white/5"
        @click="emit('close')"
      >
        Close tab
      </button>
    </header>

    <p v-if="error" class="px-4 py-2 text-sm text-[var(--warp-danger)]">{{ error }}</p>

    <div
      v-if="!summary.info.available && !loading"
      class="flex flex-1 items-center justify-center px-6 text-center text-sm text-[var(--warp-muted)]"
    >
      <div>
        <p class="font-medium text-[var(--warp-text)]">Docker is unavailable</p>
        <p class="mt-1">{{ summary.info.message ?? "Start Docker Desktop and refresh." }}</p>
      </div>
    </div>

    <template v-else>
      <div class="warp-scroll min-h-0 flex-1 overflow-auto p-4">
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-lg border border-[var(--warp-border)] bg-[var(--warp-panel)] p-3">
            <div class="text-xs uppercase text-[var(--warp-muted)]">Containers</div>
            <div class="mt-1 text-2xl font-medium">{{ summary.containers.length }}</div>
            <div class="mt-1 text-xs text-[var(--warp-muted)]">
              {{ activeContainers.length }} active · {{ pausedContainers.length }} paused ·
              {{ stoppedContainers.length }} stopped
            </div>
          </div>
          <div class="rounded-lg border border-[var(--warp-border)] bg-[var(--warp-panel)] p-3">
            <div class="text-xs uppercase text-[var(--warp-muted)]">Images</div>
            <div class="mt-1 text-2xl font-medium">{{ summary.images.length }}</div>
            <div class="mt-1 text-xs text-[var(--warp-muted)]">
              {{ inUseImages.length }} in use · {{ unusedImages.length }} removable
            </div>
          </div>
          <div class="rounded-lg border border-[var(--warp-border)] bg-[var(--warp-panel)] p-3">
            <div class="text-xs uppercase text-[var(--warp-muted)]">Volumes</div>
            <div class="mt-1 text-2xl font-medium">{{ summary.volumes.length }}</div>
            <div class="mt-1 text-xs text-[var(--warp-muted)]">Persistent Docker storage</div>
          </div>
          <div class="rounded-lg border border-[var(--warp-border)] bg-[var(--warp-panel)] p-3">
            <div class="text-xs uppercase text-[var(--warp-muted)]">Networks</div>
            <div class="mt-1 text-2xl font-medium">{{ summary.networks.length }}</div>
            <div class="mt-1 text-xs text-[var(--warp-muted)]">Bridge, host, and custom networks</div>
          </div>
        </div>

        <section class="mt-5 space-y-3">
          <div class="flex items-center gap-2">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-[var(--warp-muted)]">
              Containers
            </h3>
            <div class="flex-1" />
            <button
              v-if="stoppedContainers.length"
              type="button"
              class="rounded border border-[var(--warp-danger)]/40 px-2 py-0.5 text-[10px] text-[var(--warp-danger)] hover:bg-[var(--warp-danger)]/10 disabled:opacity-50"
              :disabled="busy"
              @click="
                pruneUnused(
                  'containers',
                  'Remove unused containers?',
                  `Remove all ${stoppedContainers.length} stopped container(s)? This cannot be undone.`,
                )
              "
            >
              Remove all unused
            </button>
          </div>
          <div v-if="summary.containers.length === 0" class="text-sm text-[var(--warp-muted)]">
            No containers found.
          </div>
          <div v-for="group in containerGroups" :key="group.title">
            <h4 v-if="group.items.length" class="mb-2 text-xs font-medium text-[var(--warp-muted)]">
              {{ group.title }}
            </h4>
            <div class="space-y-1.5">
              <div
                v-for="container in group.items"
                :key="container.id"
                class="grid cursor-pointer gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-white/[0.02] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto]"
                :class="rowClass(container)"
                @click="selectContainer(container)"
              >
                <div class="min-w-0">
                  <div class="truncate font-medium">{{ container.name || container.id }}</div>
                  <div class="mt-0.5 font-mono text-[10px] text-[var(--warp-muted)]">
                    {{ container.id }}
                  </div>
                </div>
                <div class="min-w-0">
                  <div class="truncate text-xs text-[var(--warp-muted)]">{{ container.image }}</div>
                  <div class="mt-0.5 truncate text-[10px] text-[var(--warp-faint)]">
                    {{ container.ports || "No published ports" }}
                  </div>
                </div>
                <div class="min-w-0">
                  <span
                    class="rounded px-1.5 py-0.5 text-[10px] uppercase"
                    :class="stateClass(container.state)"
                  >
                    {{ container.state || "unknown" }}
                  </span>
                  <div class="mt-1 truncate text-[10px] text-[var(--warp-muted)]">
                    {{ container.status }}
                  </div>
                </div>
                <div class="flex flex-wrap items-center justify-end gap-1" @click.stop>
                  <button
                    v-if="container.state === 'running'"
                    type="button"
                    class="rounded border border-[var(--warp-accent)]/40 px-2 py-0.5 text-xs text-[var(--warp-accent)] hover:bg-[var(--warp-accent)]/10"
                    @click="emit('openContainerLogs', container)"
                  >
                    Follow logs
                  </button>
                  <button
                    v-if="container.state === 'running'"
                    type="button"
                    class="rounded border border-[var(--warp-accent)]/40 px-2 py-0.5 text-xs text-[var(--warp-accent)] hover:bg-[var(--warp-accent)]/10"
                    @click="emit('openContainerShell', container)"
                  >
                    Shell
                  </button>
                  <button
                    v-if="container.state !== 'running'"
                    type="button"
                    class="rounded border border-[var(--warp-border)] px-2 py-0.5 text-xs hover:bg-white/5 disabled:opacity-50"
                    :disabled="busy"
                    @click="containerAction(container, 'start')"
                  >
                    Start
                  </button>
                  <button
                    v-if="container.state === 'running'"
                    type="button"
                    class="rounded border border-[var(--warp-border)] px-2 py-0.5 text-xs hover:bg-white/5 disabled:opacity-50"
                    :disabled="busy"
                    @click="containerAction(container, 'stop')"
                  >
                    Stop
                  </button>
                  <button
                    v-if="container.state === 'running'"
                    type="button"
                    class="rounded border border-[var(--warp-border)] px-2 py-0.5 text-xs hover:bg-white/5 disabled:opacity-50"
                    :disabled="busy"
                    @click="containerAction(container, 'pause')"
                  >
                    Pause
                  </button>
                  <button
                    v-if="container.state === 'paused'"
                    type="button"
                    class="rounded border border-[var(--warp-border)] px-2 py-0.5 text-xs hover:bg-white/5 disabled:opacity-50"
                    :disabled="busy"
                    @click="containerAction(container, 'unpause')"
                  >
                    Unpause
                  </button>
                  <button
                    v-if="container.state === 'running'"
                    type="button"
                    class="rounded border border-[var(--warp-border)] px-2 py-0.5 text-xs hover:bg-white/5 disabled:opacity-50"
                    :disabled="busy"
                    @click="containerAction(container, 'restart')"
                  >
                    Restart
                  </button>
                  <button
                    v-if="container.state !== 'running' && container.state !== 'paused'"
                    type="button"
                    class="rounded border border-[var(--warp-danger)]/40 px-2 py-0.5 text-xs text-[var(--warp-danger)] hover:bg-[var(--warp-danger)]/10 disabled:opacity-50"
                    :disabled="busy"
                    @click="containerAction(container, 'remove')"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="mt-6 space-y-3">
          <div class="flex items-center gap-2">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-[var(--warp-muted)]">
              Images
            </h3>
            <div class="flex-1" />
            <button
              v-if="unusedImages.length"
              type="button"
              class="rounded border border-[var(--warp-danger)]/40 px-2 py-0.5 text-[10px] text-[var(--warp-danger)] hover:bg-[var(--warp-danger)]/10 disabled:opacity-50"
              :disabled="busy"
              @click="
                pruneUnused(
                  'images',
                  'Remove unused images?',
                  `Remove all ${unusedImages.length} unused image(s)? This cannot be undone.`,
                )
              "
            >
              Remove all unused
            </button>
          </div>
          <div v-if="summary.images.length === 0" class="text-sm text-[var(--warp-muted)]">
            No images found.
          </div>
          <div v-for="group in imageGroups" :key="group.title">
            <h4 v-if="group.items.length" class="mb-2 text-xs font-medium text-[var(--warp-muted)]">
              {{ group.title }}
            </h4>
            <div class="space-y-1.5">
              <div
                v-for="image in group.items"
                :key="image.id + image.repository + image.tag"
                class="grid gap-3 rounded-lg border border-[var(--warp-border)] bg-[var(--warp-panel)] px-3 py-2 text-sm lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]"
              >
                <div class="min-w-0">
                  <div class="truncate font-medium">
                    {{ image.repository
                    }}<span class="text-[var(--warp-muted)]">:{{ image.tag }}</span>
                  </div>
                  <div class="mt-0.5 font-mono text-[10px] text-[var(--warp-muted)]">
                    {{ image.id }}
                  </div>
                </div>
                <div class="text-xs text-[var(--warp-muted)]">{{ image.size }}</div>
                <div class="truncate text-xs text-[var(--warp-muted)]">{{ image.createdSince }}</div>
                <div class="flex justify-end">
                  <button
                    type="button"
                    class="rounded border px-2 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                    :class="
                      image.inUse
                        ? 'border-[var(--warp-border)] text-[var(--warp-muted)]'
                        : 'border-[var(--warp-danger)]/40 text-[var(--warp-danger)] hover:bg-[var(--warp-danger)]/10'
                    "
                    :disabled="busy || image.inUse"
                    @click="removeImage(image)"
                  >
                    {{ image.inUse ? "In use" : "Remove" }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="mt-6 grid gap-4 xl:grid-cols-2">
          <div>
            <div class="mb-3 flex items-center gap-2">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-[var(--warp-muted)]">
                Volumes
              </h3>
              <div class="flex-1" />
              <button
                v-if="summary.volumes.length"
                type="button"
                class="rounded border border-[var(--warp-danger)]/40 px-2 py-0.5 text-[10px] text-[var(--warp-danger)] hover:bg-[var(--warp-danger)]/10 disabled:opacity-50"
                :disabled="busy"
                @click="
                  pruneUnused(
                    'volumes',
                    'Remove unused volumes?',
                    'Remove all volumes not referenced by any container. This cannot be undone.',
                  )
                "
              >
                Remove all unused
              </button>
            </div>
            <div v-if="summary.volumes.length === 0" class="text-sm text-[var(--warp-muted)]">
              No volumes found.
            </div>
            <div class="space-y-1.5">
              <div
                v-for="volume in summary.volumes"
                :key="volume.name"
                class="flex items-center gap-3 rounded-lg border border-[var(--warp-border)] bg-[var(--warp-panel)] px-3 py-2 text-sm"
              >
                <div class="min-w-0 flex-1">
                  <div class="truncate font-medium">{{ volume.name }}</div>
                  <div class="mt-0.5 text-[10px] text-[var(--warp-muted)]">
                    {{ volume.driver }} · {{ volume.scope }}
                  </div>
                </div>
                <button
                  type="button"
                  class="rounded border border-[var(--warp-danger)]/40 px-2 py-0.5 text-xs text-[var(--warp-danger)] hover:bg-[var(--warp-danger)]/10 disabled:opacity-50"
                  :disabled="busy"
                  @click="removeVolume(volume)"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>

          <div>
            <div class="mb-3 flex items-center gap-2">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-[var(--warp-muted)]">
                Networks
              </h3>
              <div class="flex-1" />
              <button
                type="button"
                class="rounded border border-[var(--warp-danger)]/40 px-2 py-0.5 text-[10px] text-[var(--warp-danger)] hover:bg-[var(--warp-danger)]/10 disabled:opacity-50"
                :disabled="busy"
                @click="
                  pruneUnused(
                    'networks',
                    'Remove unused networks?',
                    'Remove all unused custom networks. Default bridge, host, and none networks are kept.',
                  )
                "
              >
                Remove all unused
              </button>
            </div>
            <div v-if="summary.networks.length === 0" class="text-sm text-[var(--warp-muted)]">
              No networks found.
            </div>
            <div class="space-y-1.5">
              <div
                v-for="network in summary.networks"
                :key="network.id"
                class="flex items-center gap-3 rounded-lg border border-[var(--warp-border)] bg-[var(--warp-panel)] px-3 py-2 text-sm"
              >
                <div class="min-w-0 flex-1">
                  <div class="truncate font-medium">{{ network.name }}</div>
                  <div class="mt-0.5 text-[10px] text-[var(--warp-muted)]">
                    {{ network.driver }} · {{ network.scope }} · {{ network.id }}
                  </div>
                </div>
                <button
                  type="button"
                  class="rounded border px-2 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                  :class="
                    isDefaultNetwork(network)
                      ? 'border-[var(--warp-border)] text-[var(--warp-muted)]'
                      : 'border-[var(--warp-danger)]/40 text-[var(--warp-danger)] hover:bg-[var(--warp-danger)]/10'
                  "
                  :disabled="busy || isDefaultNetwork(network)"
                  @click="removeNetwork(network)"
                >
                  {{ isDefaultNetwork(network) ? "Default" : "Remove" }}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section
        v-if="selectedContainer"
        class="flex h-56 shrink-0 flex-col border-t border-[var(--warp-border)] bg-[var(--warp-panel)]"
      >
        <div class="flex items-center gap-2 border-b border-[var(--warp-border)] px-3 py-2">
          <div class="min-w-0 flex-1">
            <div class="truncate text-xs font-medium">
              {{ selectedContainer.name || selectedContainer.id }}
            </div>
            <div class="truncate text-[10px] text-[var(--warp-muted)]">
              {{ selectedContainer.image }} · {{ selectedContainer.state }}
            </div>
          </div>
          <button
            v-if="selectedIsLive"
            type="button"
            class="rounded border border-[var(--warp-accent)]/40 px-2 py-0.5 text-[10px] text-[var(--warp-accent)] hover:bg-[var(--warp-accent)]/10"
            @click="emit('openContainerLogs', selectedContainer)"
          >
            Follow logs
          </button>
          <button
            v-if="selectedContainer.state === 'running'"
            type="button"
            class="rounded border border-[var(--warp-accent)]/40 px-2 py-0.5 text-[10px] text-[var(--warp-accent)] hover:bg-[var(--warp-accent)]/10"
            @click="emit('openContainerShell', selectedContainer)"
          >
            Shell
          </button>
          <button
            type="button"
            class="rounded border border-[var(--warp-border)] px-2 py-0.5 text-[10px] hover:bg-white/5 disabled:opacity-50"
            :disabled="logsLoading"
            @click="loadContainerLogs(selectedContainer)"
          >
            Refresh logs
          </button>
          <button
            type="button"
            class="rounded border border-[var(--warp-border)] px-2 py-0.5 text-[10px] hover:bg-white/5"
            @click="selectedContainer = null"
          >
            Close
          </button>
        </div>
        <pre
          class="warp-scroll m-0 min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-[var(--warp-text)]"
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
