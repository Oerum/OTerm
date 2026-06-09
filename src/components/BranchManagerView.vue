<script setup lang="ts">
import { openUrl } from "@tauri-apps/plugin-opener";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { checkoutGitBranch } from "../lib/gitApi";
import {
  cherryPickCommit,
  checkoutDetached,
  compareCommits,
  createBranch,
  createTag,
  getCommitDetails,
  getCommitGraph,
  listBranchRefs,
  listIncomingOutgoing,
  resetCommit,
  revertCommit,
  squashCommits,
} from "../lib/branchManagerApi";
import { gitRemoteBrowserUrl } from "../lib/pullRequestApi";
import type {
  BranchRefInfo,
  CommitDetails,
  GraphCommit,
  ResetMode,
} from "../types/branchManager";
import CreateBranchDialog from "./CreateBranchDialog.vue";

const props = defineProps<{
  repoRoot: string;
}>();

const emit = defineEmits<{
  refreshGit: [];
  close: [];
}>();

const branches = ref<BranchRefInfo[]>([]);
const graph = ref<GraphCommit[]>([]);
const selectedHash = ref<string | null>(null);
const details = ref<CommitDetails | null>(null);
const compareBase = ref("");
const compareTarget = ref("");
const compareContent = ref("");
const loading = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const filter = ref("");
const showIncomingOnly = ref(false);
const showOutgoingOnly = ref(false);
const incomingHashes = ref<Set<string>>(new Set());
const outgoingHashes = ref<Set<string>>(new Set());
const resetMenuOpen = ref(false);
const createDialogOpen = ref(false);
const newBranchName = ref("");
const createSourceBranch = ref("");
const createExtraSource = ref<{ label: string; value: string } | null>(null);

const filteredGraph = computed(() => {
  let rows = graph.value;
  if (showIncomingOnly.value) {
    rows = rows.filter((c) => incomingHashes.value.has(c.hash));
  }
  if (showOutgoingOnly.value) {
    rows = rows.filter((c) => outgoingHashes.value.has(c.hash));
  }
  const q = filter.value.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (c) =>
      c.subject.toLowerCase().includes(q) ||
      c.shortHash.includes(q) ||
      c.author.toLowerCase().includes(q),
  );
});

const selectedIndex = computed(() =>
  graph.value.findIndex((c) => c.hash === selectedHash.value),
);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [branchRows, graphRows] = await Promise.all([
      listBranchRefs(props.repoRoot),
      getCommitGraph(props.repoRoot, 250),
    ]);
    branches.value = branchRows;
    graph.value = graphRows;
    if (!selectedHash.value && graphRows.length > 0) {
      selectedHash.value = graphRows[0].hash;
    }
    await refreshSyncMarkers();
    await loadDetails();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function refreshSyncMarkers() {
  try {
    const [incoming, outgoing] = await Promise.all([
      listIncomingOutgoing(props.repoRoot, "incoming").catch(() => []),
      listIncomingOutgoing(props.repoRoot, "outgoing").catch(() => []),
    ]);
    incomingHashes.value = new Set(incoming.map((c) => c.hash));
    outgoingHashes.value = new Set(outgoing.map((c) => c.hash));
  } catch {
    incomingHashes.value = new Set();
    outgoingHashes.value = new Set();
  }
}

async function loadDetails() {
  if (!selectedHash.value) {
    details.value = null;
    return;
  }
  details.value = await getCommitDetails(props.repoRoot, selectedHash.value);
}

async function runAction(action: () => Promise<void>) {
  busy.value = true;
  error.value = null;
  try {
    await action();
    emit("refreshGit");
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

function selectCommit(hash: string) {
  selectedHash.value = hash;
}

function navigateParent() {
  const parents = details.value?.parents ?? [];
  if (parents[0]) selectedHash.value = parents[0];
}

function navigateChild() {
  const idx = selectedIndex.value;
  if (idx <= 0) return;
  const parent = graph.value[idx];
  const child = graph.value
    .slice(0, idx)
    .find((c) => c.parents.includes(parent.hash));
  if (child) selectedHash.value = child.hash;
}

async function onCompare() {
  if (!compareBase.value || !compareTarget.value) return;
  const result = await compareCommits(
    props.repoRoot,
    compareBase.value,
    compareTarget.value,
  );
  compareContent.value = result.content;
}

async function openCommitInBrowser() {
  if (!selectedHash.value) return;
  const url = await gitRemoteBrowserUrl(props.repoRoot, "commit", selectedHash.value);
  await openUrl(url);
}

function promptInput(message: string, defaultValue = ""): string | null {
  return globalThis.prompt(message, defaultValue);
}

function resolveDefaultSource(preferred?: string): string {
  if (preferred?.trim()) return preferred.trim();
  const current = branches.value.find((b) => b.isCurrent);
  if (current) return current.name;
  const firstLocal = branches.value.find((b) => !b.isRemote);
  if (firstLocal) return firstLocal.name;
  return branches.value[0]?.name ?? "";
}

function openCreateDialog(source?: string) {
  createExtraSource.value = null;
  newBranchName.value = "";
  createSourceBranch.value = resolveDefaultSource(source);
  createDialogOpen.value = true;
}

function openCreateDialogFromCommit(hash: string, shortHash: string) {
  createExtraSource.value = {
    label: `Commit ${shortHash}`,
    value: hash,
  };
  newBranchName.value = "";
  createSourceBranch.value = hash;
  createDialogOpen.value = true;
}

function closeCreateDialog() {
  createDialogOpen.value = false;
  createExtraSource.value = null;
}

function submitCreateBranch() {
  const name = newBranchName.value.trim();
  const source = createSourceBranch.value.trim();
  if (!name || !source) return;
  closeCreateDialog();
  void runAction(() => createBranch(props.repoRoot, name, source));
}

function createBranchFromSelection() {
  if (!details.value) return;
  openCreateDialogFromCommit(details.value.hash, details.value.shortHash);
}

async function createTagFromSelection() {
  const name = promptInput("Tag name");
  if (!name?.trim() || !details.value) return;
  await createTag(props.repoRoot, name.trim(), details.value.hash);
}

async function squashFromSelection() {
  const count = Number(promptInput("Squash how many commits?", "2"));
  if (!Number.isFinite(count) || count < 2) return;
  const message = promptInput("Squash commit message") ?? "";
  if (!message.trim()) return;
  await squashCommits(props.repoRoot, count, message.trim());
}

function runReset(mode: ResetMode) {
  resetMenuOpen.value = false;
  if (!details.value) return;
  void runAction(() => resetCommit(props.repoRoot, details.value!.hash, mode));
}

function onDocumentMouseDown(event: MouseEvent) {
  if (!resetMenuOpen.value) return;
  const target = event.target as Element | null;
  if (!target?.closest("[data-reset-menu-root]")) {
    resetMenuOpen.value = false;
  }
}

function onKeyDown(event: KeyboardEvent) {
  if (!event.altKey) return;
  if (event.key === "PageUp") {
    event.preventDefault();
    navigateParent();
  }
  if (event.key === "PageDown") {
    event.preventDefault();
    navigateChild();
  }
}

onMounted(() => {
  void load();
  window.addEventListener("keydown", onKeyDown);
  document.addEventListener("mousedown", onDocumentMouseDown);
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
  document.removeEventListener("mousedown", onDocumentMouseDown);
});
watch(() => props.repoRoot, () => void load());
watch(selectedHash, () => void loadDetails());
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col bg-[var(--warp-bg)] text-[var(--warp-text)]">
    <header
      class="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--warp-border)] px-4 py-2"
    >
      <h2 class="text-sm font-medium">Branches</h2>
      <span class="truncate text-xs text-[var(--warp-muted)]">{{ repoRoot }}</span>
      <div class="flex-1" />
      <input
        v-model="filter"
        type="search"
        placeholder="Filter commits"
        class="rounded border border-[var(--warp-border)] bg-transparent px-2 py-1 text-xs"
      />
      <label class="flex items-center gap-1 text-xs text-[var(--warp-muted)]">
        <input v-model="showIncomingOnly" type="checkbox" class="accent-[var(--warp-accent)]" />
        Incoming
      </label>
      <label class="flex items-center gap-1 text-xs text-[var(--warp-muted)]">
        <input v-model="showOutgoingOnly" type="checkbox" class="accent-[var(--warp-accent)]" />
        Outgoing
      </label>
      <button
        type="button"
        class="rounded border border-[var(--warp-border)] px-2 py-1 text-xs hover:bg-white/5"
        :disabled="loading"
        @click="load"
      >
        Refresh
      </button>
      <button
        type="button"
        class="rounded border border-[var(--warp-border)] px-2 py-1 text-xs hover:bg-white/5"
        @click="emit('close')"
      >
        Close tab
      </button>
    </header>

    <p v-if="error" class="px-4 py-2 text-sm text-[var(--warp-danger)]">{{ error }}</p>

    <div class="flex min-h-0 flex-1">
      <aside class="warp-scroll w-56 shrink-0 overflow-auto border-r border-[var(--warp-border)] p-2">
        <div class="mb-2 flex items-center justify-between gap-1">
          <h3 class="text-xs font-medium uppercase text-[var(--warp-muted)]">Branches</h3>
          <button
            type="button"
            class="rounded border border-[var(--warp-border)] px-1.5 py-0.5 text-[10px] text-[var(--warp-muted)] hover:bg-white/5 hover:text-[var(--warp-text)]"
            title="Create new branch"
            :disabled="busy"
            @click="openCreateDialog()"
          >
            New branch
          </button>
        </div>
        <div
          v-for="branch in branches"
          :key="branch.name"
          class="mb-1 flex items-stretch gap-0.5 rounded"
          :class="branch.isCurrent ? 'bg-[var(--warp-accent-dim)]' : ''"
        >
          <button
            type="button"
            class="min-w-0 flex-1 rounded px-2 py-1 text-left text-xs hover:bg-white/5"
            :class="branch.isCurrent ? 'text-[var(--warp-accent)]' : ''"
            @click="
              runAction(() =>
                checkoutGitBranch(props.repoRoot, branch.name, branch.isRemote),
              )
            "
          >
            <div class="truncate">{{ branch.name }}</div>
            <div v-if="branch.ahead || branch.behind" class="text-[10px] text-[var(--warp-muted)]">
              ↑{{ branch.ahead }} ↓{{ branch.behind }}
            </div>
          </button>
          <button
            type="button"
            class="shrink-0 rounded px-1.5 text-xs text-[var(--warp-muted)] hover:bg-white/5 hover:text-[var(--warp-text)]"
            title="Create branch from this branch"
            :disabled="busy"
            @click.stop="openCreateDialog(branch.name)"
          >
            +
          </button>
        </div>
      </aside>

      <section class="flex min-w-0 flex-1 flex-col border-r border-[var(--warp-border)]">
        <div class="warp-scroll min-h-0 flex-1 overflow-auto font-mono text-xs">
          <button
            v-for="commit in filteredGraph"
            :key="commit.hash"
            type="button"
            class="block w-full border-b border-[var(--warp-border)] px-3 py-1.5 text-left hover:bg-white/5"
            :class="selectedHash === commit.hash ? 'bg-white/5' : ''"
            @click="selectCommit(commit.hash)"
          >
            <span class="text-[var(--warp-accent)]">{{ commit.shortHash }}</span>
            <span class="ml-2">{{ commit.subject }}</span>
            <span class="ml-2 text-[var(--warp-muted)]">{{ commit.decorations }}</span>
          </button>
        </div>
      </section>

      <section class="flex min-h-0 min-w-0 w-[28rem] shrink-0 flex-col overflow-hidden text-sm">
        <template v-if="details">
          <div class="shrink-0 overflow-visible p-3 pb-2">
            <h3 class="font-medium">{{ details.subject }}</h3>
            <p class="mt-1 text-xs text-[var(--warp-muted)]">
              {{ details.shortHash }} · {{ details.author }} · {{ details.date }}
            </p>
            <pre
              v-if="details.body"
              class="mt-2 whitespace-pre-wrap text-xs text-[var(--warp-muted)]"
              >{{ details.body }}</pre
            >

            <div class="mt-3 flex flex-wrap gap-1">
            <button
              type="button"
              class="rounded border border-[var(--warp-border)] px-2 py-0.5 text-xs"
              :disabled="busy"
              @click="runAction(() => checkoutDetached(repoRoot, details!.hash))"
            >
              Checkout detached
            </button>
            <button
              type="button"
              class="rounded border border-[var(--warp-border)] px-2 py-0.5 text-xs"
              @click="openCommitInBrowser"
            >
              Open in browser
            </button>
            <button
              type="button"
              class="rounded border border-[var(--warp-border)] px-2 py-0.5 text-xs"
              :disabled="busy"
              @click="runAction(() => revertCommit(repoRoot, details!.hash))"
            >
              Revert
            </button>
            <div class="relative" data-reset-menu-root>
              <button
                type="button"
                class="flex items-center gap-1 rounded border border-[var(--warp-border)] px-2 py-0.5 text-xs"
                :disabled="busy"
                @click.stop="resetMenuOpen = !resetMenuOpen"
              >
                Reset
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="none"
                  stroke="currentColor"
                  class="opacity-70"
                >
                  <path d="M2 3l2 2 2-2" stroke-width="1.2" stroke-linecap="round" />
                </svg>
              </button>
              <div
                v-if="resetMenuOpen"
                class="absolute right-0 top-full z-30 mt-1 w-max max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-[var(--warp-border-strong)] bg-[var(--warp-elevated)] py-1 shadow-lg"
              >
                <button
                  type="button"
                  class="block w-full px-3 py-1.5 text-left text-xs hover:bg-white/5"
                  @click="runReset('mixed')"
                >
                  Keep Changes (--mixed)
                </button>
                <button
                  type="button"
                  class="block w-full px-3 py-1.5 text-left text-xs hover:bg-white/5"
                  @click="runReset('hard')"
                >
                  Delete Changes (--hard)
                </button>
              </div>
            </div>
            <button
              type="button"
              class="rounded border border-[var(--warp-border)] px-2 py-0.5 text-xs"
              :disabled="busy"
              @click="runAction(() => cherryPickCommit(repoRoot, details!.hash))"
            >
              Cherry-pick
            </button>
            <button
              type="button"
              class="rounded border border-[var(--warp-border)] px-2 py-0.5 text-xs"
              :disabled="busy"
              @click="createBranchFromSelection"
            >
              New branch
            </button>
            <button
              type="button"
              class="rounded border border-[var(--warp-border)] px-2 py-0.5 text-xs"
              :disabled="busy"
              @click="runAction(createTagFromSelection)"
            >
              New tag
            </button>
            <button
              type="button"
              class="rounded border border-[var(--warp-border)] px-2 py-0.5 text-xs"
              :disabled="busy"
              @click="runAction(squashFromSelection)"
            >
              Squash
            </button>
            </div>

            <div class="mt-4 min-w-0 space-y-2">
              <div class="text-xs font-medium text-[var(--warp-muted)]">Compare</div>
              <div
                class="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2"
              >
                <input
                  v-model="compareBase"
                  placeholder="Base"
                  class="min-w-0 rounded border border-[var(--warp-border)] bg-transparent px-2 py-1 text-xs"
                />
                <input
                  v-model="compareTarget"
                  placeholder="Target"
                  class="min-w-0 rounded border border-[var(--warp-border)] bg-transparent px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  class="shrink-0 whitespace-nowrap rounded border border-[var(--warp-border)] px-3 py-1 text-xs"
                  @click="onCompare"
                >
                  Compare
                </button>
              </div>
            </div>
          </div>

          <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-3 pb-3">
            <pre
              v-if="compareContent"
              class="warp-scroll max-h-48 shrink-0 overflow-auto rounded border border-[var(--warp-border)] bg-[var(--warp-panel)] p-2 text-[10px] leading-relaxed whitespace-pre-wrap"
              >{{ compareContent }}</pre
            >
            <pre
              class="warp-scroll min-h-0 flex-1 overflow-auto rounded border border-[var(--warp-border)] bg-[var(--warp-panel)] p-2 text-[10px] leading-relaxed whitespace-pre-wrap text-[var(--warp-muted)]"
              >{{ details.diff }}</pre
            >
          </div>
        </template>
        <p v-else class="p-3 text-sm text-[var(--warp-muted)]">Select a commit</p>
      </section>
    </div>

    <CreateBranchDialog
      :open="createDialogOpen"
      :branches="branches"
      :extra-source="createExtraSource"
      :submit-disabled="busy"
      v-model:name="newBranchName"
      v-model:source="createSourceBranch"
      @confirm="submitCreateBranch"
      @cancel="closeCreateDialog"
    />
  </div>
</template>
