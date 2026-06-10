<script setup lang="ts">
import { openUrl } from "@tauri-apps/plugin-opener";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  canMergeBranchLocally,
  filterBranchSections,
  groupBranches,
  localBranchName,
  type BranchFolderGroup,
} from "../lib/branchGrouping";
import { isGithubPrCapable } from "../lib/createPrFlow";
import {
  fetchGitRepo,
  listGitBranches,
  pullGitRepo,
  pushGitRepo,
} from "../lib/gitApi";
import {
  cherryPickCommit,
  switchDetached,
  compareCommits,
  createBranch,
  createTag,
  deleteBranch,
  getCommitDetails,
  getCommitGraph,
  listBranchRefs,
  listIncomingOutgoing,
  mergeBranch,
  resetCommit,
  revertCommit,
  squashCommits,
} from "../lib/branchManagerApi";
import {
  createPullRequest,
  detectPrProvider,
  gitRemoteBrowserUrl,
} from "../lib/pullRequestApi";
import { inferDefaultBaseBranch } from "../lib/prBranchDefaults";
import { formatGitOperationError } from "../lib/formatGitError";
import { pushAppToast, setAppToastActivity } from "../lib/appToast";
import type {
  BranchRefInfo,
  CommitDetails,
  GraphCommit,
  ResetMode,
} from "../types/branchManager";
import type { GitBranchList } from "../types/git";
import ConfirmDialog from "./ConfirmDialog.vue";
import BranchContextMenu from "./BranchContextMenu.vue";
import BranchListItem from "./BranchListItem.vue";
import CreateBranchDialog from "./CreateBranchDialog.vue";
import CreatePullRequestDialog from "./CreatePullRequestDialog.vue";
import MergeBranchDialog from "./MergeBranchDialog.vue";

const props = defineProps<{
  repoRoot: string;
  switchBranch: (
    branch: string,
    isRemote: boolean,
    repoRoot?: string,
  ) => Promise<void>;
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
const branchFilter = ref("");
const showIncomingOnly = ref(false);
const showOutgoingOnly = ref(false);
const incomingHashes = ref<Set<string>>(new Set());
const outgoingHashes = ref<Set<string>>(new Set());
const resetMenuOpen = ref(false);
const createDialogOpen = ref(false);
const newBranchName = ref("");
const createSourceBranch = ref("");
const createExtraSource = ref<{ label: string; value: string } | null>(null);
const collapsedFolders = ref<Set<string>>(new Set());
const collapsedDefaultsApplied = ref(false);
const confirmOpen = ref(false);
const pendingConfirm = ref<{
  title: string;
  message: string;
  confirmLabel?: string;
  dangerous?: boolean;
  onConfirm: () => void | Promise<void>;
} | null>(null);
const mergeDialogOpen = ref(false);
const mergeSource = ref<BranchRefInfo | null>(null);
const mergeTarget = ref("");
const mergeError = ref<string | null>(null);
const mergePrAvailable = ref(false);
const gitBranchList = ref<GitBranchList | null>(null);
const createPrOpen = ref(false);
const createPrTitle = ref("");
const createPrBody = ref("");
const createPrBase = ref("");
const createPrHead = ref("");
const createPrDraft = ref(false);
const createPrBusy = ref(false);
const createPrError = ref<string | null>(null);
const branchContextMenuOpen = ref(false);
const branchContextMenuX = ref(0);
const branchContextMenuY = ref(0);
const branchContextTarget = ref<BranchRefInfo | null>(null);

const groupedBranches = computed(() =>
  filterBranchSections(groupBranches(branches.value), branchFilter.value),
);

const localTargetBranches = computed(() => {
  const source = localBranchName(mergeSource.value ?? ({} as BranchRefInfo));
  return (gitBranchList.value?.local ?? []).filter((name) => name !== source);
});

const defaultMergeTarget = computed(() => {
  const source = localBranchName(mergeSource.value ?? ({} as BranchRefInfo));
  const current = branches.value.find((b) => b.isCurrent);
  return inferDefaultBaseBranch(
    gitBranchList.value ?? { current: null, local: [], remote: [] },
    current?.upstream,
    source,
  );
});

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

function applyDefaultCollapsedFolders() {
  if (collapsedDefaultsApplied.value) return;
  const next = new Set(collapsedFolders.value);
  for (const section of groupBranches(branches.value)) {
    if (section.label === "Local") continue;
    for (const item of section.items) {
      if (isFolder(item)) {
        next.add(folderKey(section.label, item.label));
      }
    }
  }
  collapsedFolders.value = next;
  collapsedDefaultsApplied.value = true;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [branchRows, graphPage] = await Promise.all([
      listBranchRefs(props.repoRoot),
      getCommitGraph(props.repoRoot, { limit: 250, scope: "all" }),
    ]);
    branches.value = branchRows;
    applyDefaultCollapsedFolders();
    graph.value = graphPage.commits;
    if (!selectedHash.value && graphPage.commits.length > 0) {
      selectedHash.value = graphPage.commits[0].hash;
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

async function runAction(
  action: () => Promise<void>,
  options?: { successMessage?: string; activityMessage?: string },
) {
  busy.value = true;
  error.value = null;
  setAppToastActivity(options?.activityMessage ?? "Running git operation…");
  try {
    await action();
    emit("refreshGit");
    await load();
    if (options?.successMessage) {
      pushAppToast(options.successMessage, "success");
    }
  } catch (err) {
    const message = formatGitOperationError(err);
    error.value = message;
    pushAppToast(message, "error");
  } finally {
    setAppToastActivity(null);
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
  error.value = null;
  createExtraSource.value = null;
  newBranchName.value = "";
  createSourceBranch.value = resolveDefaultSource(source);
  createDialogOpen.value = true;
}

function openCreateDialogFromCommit(hash: string, shortHash: string) {
  error.value = null;
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
  if (busy.value) return;
  const name = newBranchName.value.trim();
  const source = createSourceBranch.value.trim();
  if (!name || !source) return;
  void runAction(
    async () => {
      await createBranch(props.repoRoot, name, source);
      closeCreateDialog();
    },
    {
      successMessage: `Created branch ${name}`,
      activityMessage: "Creating branch…",
    },
  );
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

function folderKey(section: string, label: string): string {
  return `${section}::${label}`;
}

function isFolderCollapsed(section: string, label: string): boolean {
  return collapsedFolders.value.has(folderKey(section, label));
}

function toggleFolder(section: string, label: string) {
  const key = folderKey(section, label);
  const next = new Set(collapsedFolders.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsedFolders.value = next;
}

function isFolder(item: BranchRefInfo | BranchFolderGroup): item is BranchFolderGroup {
  return "kind" in item && item.kind === "folder";
}

function requestConfirm(options: {
  title: string;
  message: string;
  confirmLabel?: string;
  dangerous?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  pendingConfirm.value = options;
  confirmOpen.value = true;
}

function resolveConfirm(accepted: boolean) {
  const pending = pendingConfirm.value;
  confirmOpen.value = false;
  pendingConfirm.value = null;
  if (accepted && pending) void pending.onConfirm();
}

function openDeleteDialog(branch: BranchRefInfo) {
  if (branch.isCurrent) return;
  const title = branch.isRemote ? "Delete remote branch?" : "Delete branch?";
  const message = branch.isRemote
    ? `This will delete ${branch.name} on the remote. This cannot be undone.`
    : `Delete local branch "${branch.name}"? Unmerged commits may be lost.`;
  requestConfirm({
    title,
    message,
    confirmLabel: "Delete",
    dangerous: true,
    onConfirm: () => runDeleteBranch(branch, false),
  });
}

function closeBranchContextMenu() {
  branchContextMenuOpen.value = false;
  branchContextTarget.value = null;
}

function openBranchContextMenu(branch: BranchRefInfo, event: MouseEvent) {
  branchContextTarget.value = branch;
  branchContextMenuX.value = event.clientX;
  branchContextMenuY.value = event.clientY;
  branchContextMenuOpen.value = true;
}

function switchBranchItem(branch: BranchRefInfo) {
  void runSwitchBranch(branch);
}

async function runSwitchBranch(branch: BranchRefInfo) {
  if (branch.isCurrent || busy.value) return;
  busy.value = true;
  setAppToastActivity("Switching branch…");
  try {
    await props.switchBranch(branch.name, branch.isRemote, props.repoRoot);
    await load();
    pushAppToast(`Switched to ${branch.name}`, "success");
  } catch {
    // Error toast is shown by App.vue.
  } finally {
    setAppToastActivity(null);
    busy.value = false;
  }
}

async function onBranchContextCopyName() {
  const branch = branchContextTarget.value;
  if (!branch) return;
  closeBranchContextMenu();
  try {
    await navigator.clipboard.writeText(branch.name);
    pushAppToast("Branch name copied", "success");
  } catch {
    pushAppToast("Could not copy branch name", "error");
  }
}

function onBranchContextSwitch() {
  const branch = branchContextTarget.value;
  if (!branch) return;
  closeBranchContextMenu();
  void runSwitchBranch(branch);
}

function onBranchContextPull() {
  const branch = branchContextTarget.value;
  if (!branch || branch.isRemote) return;
  closeBranchContextMenu();
  void runAction(
    async () => {
      if (!branch.isCurrent) {
        await props.switchBranch(branch.name, false, props.repoRoot);
      }
      await pullGitRepo(props.repoRoot);
    },
    {
      successMessage: "Pulled latest changes",
      activityMessage: "Pulling changes…",
    },
  );
}

function onBranchContextPush() {
  const branch = branchContextTarget.value;
  if (!branch || branch.isRemote) return;
  closeBranchContextMenu();
  void runAction(
    async () => {
      if (!branch.isCurrent) {
        await props.switchBranch(branch.name, false, props.repoRoot);
      }
      await pushGitRepo(props.repoRoot);
    },
    {
      successMessage: "Pushed to remote",
      activityMessage: "Pushing changes…",
    },
  );
}

function onBranchContextFetch() {
  closeBranchContextMenu();
  void runAction(() => fetchGitRepo(props.repoRoot), {
    successMessage: "Fetched from remote",
    activityMessage: "Fetching from remote…",
  });
}

function onBranchContextCreateFrom() {
  const branch = branchContextTarget.value;
  if (!branch) return;
  closeBranchContextMenu();
  openCreateDialog(branch.name);
}

function onBranchContextMerge() {
  const branch = branchContextTarget.value;
  if (!branch) return;
  closeBranchContextMenu();
  openMergeDialog(branch);
}

function onBranchContextDelete() {
  const branch = branchContextTarget.value;
  if (!branch) return;
  closeBranchContextMenu();
  openDeleteDialog(branch);
}

async function runDeleteBranch(branch: BranchRefInfo, force: boolean) {
  busy.value = true;
  error.value = null;
  setAppToastActivity("Deleting branch…");
  try {
    await deleteBranch(props.repoRoot, branch.name, branch.isRemote, force);
    emit("refreshGit");
    await load();
    pushAppToast(`Deleted ${branch.name}`, "success");
  } catch (err) {
    const message = formatGitOperationError(err);
    if (!force && !branch.isRemote && /not fully merged/i.test(message)) {
      requestConfirm({
        title: "Force delete branch?",
        message: `${message}\n\nForce delete "${branch.name}" anyway?`,
        confirmLabel: "Force delete",
        dangerous: true,
        onConfirm: () => runDeleteBranch(branch, true),
      });
      return;
    }
    error.value = message;
    pushAppToast(message, "error");
  } finally {
    setAppToastActivity(null);
    busy.value = false;
  }
}

async function openMergeDialog(branch: BranchRefInfo) {
  mergeError.value = null;
  mergeSource.value = branch;
  mergeTarget.value = "";
  try {
    const [list, provider] = await Promise.all([
      listGitBranches(props.repoRoot),
      detectPrProvider(props.repoRoot).catch(() => null),
    ]);
    gitBranchList.value = list;
    mergePrAvailable.value = isGithubPrCapable(provider);
    mergeTarget.value = inferDefaultBaseBranch(
      list,
      branch.upstream,
      localBranchName(branch),
    );
  } catch (err) {
    mergeError.value = err instanceof Error ? err.message : String(err);
    mergePrAvailable.value = false;
  }
  mergeDialogOpen.value = true;
}

function closeMergeDialog() {
  mergeDialogOpen.value = false;
  mergeSource.value = null;
  mergeError.value = null;
}

function confirmMergeLocally() {
  const branch = mergeSource.value;
  const locals = gitBranchList.value?.local ?? [];
  if (!branch || !canMergeBranchLocally(branch, locals)) return;
  const source = localBranchName(branch);
  const target = mergeTarget.value;
  if (!source || !target || source === target) return;

  const needsSwitch = !branches.value.some((b) => b.isCurrent && b.name === target);
  const proceed = () =>
    void runAction(
      async () => {
        await mergeBranch(props.repoRoot, source, target);
        closeMergeDialog();
      },
      {
        successMessage: `Merged ${source} into ${target}`,
        activityMessage: "Merging branches…",
      },
    );

  if (needsSwitch) {
    requestConfirm({
      title: "Merge locally?",
      message: `Switch to "${target}" and merge "${source}" into it.`,
      confirmLabel: "Merge",
      onConfirm: proceed,
    });
    return;
  }
  proceed();
}

function openCreatePrFromMerge() {
  const source = mergeSource.value ? localBranchName(mergeSource.value) : null;
  const target = mergeTarget.value;
  if (!source || !target || source === target) return;
  createPrHead.value = source;
  createPrBase.value = target;
  createPrTitle.value = `Update ${source}`;
  createPrBody.value = "";
  createPrDraft.value = false;
  createPrError.value = null;
  mergeDialogOpen.value = false;
  createPrOpen.value = true;
}

function closeCreatePrDialog() {
  createPrOpen.value = false;
  createPrError.value = null;
}

async function submitCreatePr() {
  if (!createPrTitle.value.trim() || !createPrBase.value || !createPrHead.value) return;
  if (createPrBase.value === createPrHead.value) {
    createPrError.value = "Base and compare branches must be different.";
    return;
  }
  createPrBusy.value = true;
  createPrError.value = null;
  try {
    await createPullRequest({
      repoRoot: props.repoRoot,
      title: createPrTitle.value.trim(),
      body: createPrBody.value,
      base: createPrBase.value,
      head: createPrHead.value,
      draft: createPrDraft.value,
    });
    closeCreatePrDialog();
    closeMergeDialog();
    emit("refreshGit");
    await load();
  } catch (err) {
    createPrError.value = err instanceof Error ? err.message : String(err);
  } finally {
    createPrBusy.value = false;
  }
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
watch(() => props.repoRoot, () => {
  collapsedDefaultsApplied.value = false;
  collapsedFolders.value = new Set();
  void load();
});
watch(selectedHash, () => void loadDetails());
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col bg-[var(--oterm-bg)] text-[var(--oterm-text)]">
    <header
      class="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--oterm-border)] px-4 py-2"
    >
      <h2 class="text-sm font-medium">Branches</h2>
      <span class="truncate text-xs text-[var(--oterm-muted)]">{{ repoRoot }}</span>
      <div class="flex-1" />
      <input
        v-model="filter"
        type="search"
        placeholder="Filter commits"
        class="rounded border border-[var(--oterm-border)] bg-transparent px-2 py-1 text-xs"
      />
      <label class="flex items-center gap-1 text-xs text-[var(--oterm-muted)]">
        <input v-model="showIncomingOnly" type="checkbox" class="accent-[var(--oterm-accent)]" />
        Incoming
      </label>
      <label class="flex items-center gap-1 text-xs text-[var(--oterm-muted)]">
        <input v-model="showOutgoingOnly" type="checkbox" class="accent-[var(--oterm-accent)]" />
        Outgoing
      </label>
      <button
        type="button"
        class="rounded border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5"
        :disabled="loading"
        @click="load"
      >
        Refresh
      </button>
      <button
        type="button"
        class="rounded border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5"
        @click="emit('close')"
      >
        Close tab
      </button>
    </header>

    <p v-if="error" class="px-4 py-2 text-sm text-[var(--oterm-danger)]">{{ error }}</p>

    <div class="flex min-h-0 flex-1">
      <aside class="oterm-scroll w-64 shrink-0 overflow-auto border-r border-[var(--oterm-border)] p-2">
        <div class="mb-2 flex items-center justify-between gap-1">
          <h3 class="text-xs font-medium uppercase text-[var(--oterm-muted)]">Branches</h3>
          <button
            type="button"
            class="rounded border border-[var(--oterm-border)] px-1.5 py-0.5 text-[10px] text-[var(--oterm-muted)] hover:bg-white/5 hover:text-[var(--oterm-text)]"
            title="Create new branch"
            :disabled="busy"
            @click="openCreateDialog()"
          >
            New branch
          </button>
        </div>
        <input
          v-model="branchFilter"
          type="search"
          placeholder="Filter branches"
          class="mb-2 w-full rounded border border-[var(--oterm-border)] bg-transparent px-2 py-1 text-xs"
        />

        <div v-for="section in groupedBranches" :key="section.label" class="mb-3">
          <div class="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-[var(--oterm-faint)]">
            {{ section.label }}
          </div>

          <template v-for="item in section.items" :key="isFolder(item) ? `${section.label}-${item.label}` : item.name">
            <template v-if="isFolder(item)">
              <button
                type="button"
                class="mb-0.5 flex w-full items-center gap-1 rounded px-2 py-1 text-left text-[11px] text-[var(--oterm-muted)] hover:bg-white/5"
                @click="toggleFolder(section.label, item.label)"
              >
                <span class="w-3 text-[10px]">{{ isFolderCollapsed(section.label, item.label) ? "▸" : "▾" }}</span>
                <span class="truncate" :title="item.label">{{ item.label }}</span>
                <span class="text-[var(--oterm-faint)]">({{ item.branches.length }})</span>
              </button>
              <template v-if="!isFolderCollapsed(section.label, item.label)">
                <BranchListItem
                  v-for="branch in item.branches"
                  :key="branch.name"
                  :branch="branch"
                  :busy="busy"
                  indented
                  @switch="switchBranchItem(branch)"
                  @create="openCreateDialog(branch.name)"
                  @merge="openMergeDialog(branch)"
                  @delete="openDeleteDialog(branch)"
                  @contextmenu="openBranchContextMenu(branch, $event)"
                />
              </template>
            </template>

            <BranchListItem
              v-else
              :branch="item"
              :busy="busy"
              @switch="switchBranchItem(item)"
              @create="openCreateDialog(item.name)"
              @merge="openMergeDialog(item)"
              @delete="openDeleteDialog(item)"
              @contextmenu="openBranchContextMenu(item, $event)"
            />
          </template>
        </div>
      </aside>

      <section class="flex min-w-0 flex-1 flex-col border-r border-[var(--oterm-border)]">
        <div class="oterm-scroll min-h-0 flex-1 overflow-auto font-mono text-xs">
          <button
            v-for="commit in filteredGraph"
            :key="commit.hash"
            type="button"
            class="block w-full border-b border-[var(--oterm-border)] px-3 py-1.5 text-left hover:bg-white/5"
            :class="selectedHash === commit.hash ? 'bg-white/5' : ''"
            @click="selectCommit(commit.hash)"
          >
            <span class="text-[var(--oterm-accent)]">{{ commit.shortHash }}</span>
            <span class="ml-2">{{ commit.subject }}</span>
            <span class="ml-2 text-[var(--oterm-muted)]">{{ commit.decorations }}</span>
          </button>
        </div>
      </section>

      <section class="flex min-h-0 min-w-0 w-[28rem] shrink-0 flex-col overflow-hidden text-sm">
        <template v-if="details">
          <div class="shrink-0 overflow-visible p-3 pb-2">
            <h3 class="font-medium">{{ details.subject }}</h3>
            <p class="mt-1 text-xs text-[var(--oterm-muted)]">
              {{ details.shortHash }} · {{ details.author }} · {{ details.date }}
            </p>
            <pre
              v-if="details.body"
              class="mt-2 whitespace-pre-wrap text-xs text-[var(--oterm-muted)]"
              >{{ details.body }}</pre
            >

            <div class="mt-3 flex flex-wrap gap-1">
            <button
              type="button"
              class="rounded border border-[var(--oterm-border)] px-2 py-0.5 text-xs"
              :disabled="busy"
              @click="runAction(() => switchDetached(repoRoot, details!.hash))"
            >
              Switch to detached HEAD
            </button>
            <button
              type="button"
              class="rounded border border-[var(--oterm-border)] px-2 py-0.5 text-xs"
              @click="openCommitInBrowser"
            >
              Open in browser
            </button>
            <button
              type="button"
              class="rounded border border-[var(--oterm-border)] px-2 py-0.5 text-xs"
              :disabled="busy"
              @click="runAction(() => revertCommit(repoRoot, details!.hash))"
            >
              Revert
            </button>
            <div class="relative" data-reset-menu-root>
              <button
                type="button"
                class="flex items-center gap-1 rounded border border-[var(--oterm-border)] px-2 py-0.5 text-xs"
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
                class="absolute right-0 top-full z-30 mt-1 w-max max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] py-1 shadow-lg"
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
              class="rounded border border-[var(--oterm-border)] px-2 py-0.5 text-xs"
              :disabled="busy"
              @click="runAction(() => cherryPickCommit(repoRoot, details!.hash))"
            >
              Cherry-pick
            </button>
            <button
              type="button"
              class="rounded border border-[var(--oterm-border)] px-2 py-0.5 text-xs"
              :disabled="busy"
              @click="createBranchFromSelection"
            >
              New branch
            </button>
            <button
              type="button"
              class="rounded border border-[var(--oterm-border)] px-2 py-0.5 text-xs"
              :disabled="busy"
              @click="runAction(createTagFromSelection)"
            >
              New tag
            </button>
            <button
              type="button"
              class="rounded border border-[var(--oterm-border)] px-2 py-0.5 text-xs"
              :disabled="busy"
              @click="runAction(squashFromSelection)"
            >
              Squash
            </button>
            </div>

            <div class="mt-4 min-w-0 space-y-2">
              <div class="text-xs font-medium text-[var(--oterm-muted)]">Compare</div>
              <div
                class="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2"
              >
                <input
                  v-model="compareBase"
                  placeholder="Base"
                  class="min-w-0 rounded border border-[var(--oterm-border)] bg-transparent px-2 py-1 text-xs"
                />
                <input
                  v-model="compareTarget"
                  placeholder="Target"
                  class="min-w-0 rounded border border-[var(--oterm-border)] bg-transparent px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  class="shrink-0 whitespace-nowrap rounded border border-[var(--oterm-border)] px-3 py-1 text-xs"
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
              class="oterm-scroll max-h-48 shrink-0 overflow-auto rounded border border-[var(--oterm-border)] bg-[var(--oterm-panel)] p-2 text-[10px] leading-relaxed whitespace-pre-wrap"
              >{{ compareContent }}</pre
            >
            <pre
              class="oterm-scroll min-h-0 flex-1 overflow-auto rounded border border-[var(--oterm-border)] bg-[var(--oterm-panel)] p-2 text-[10px] leading-relaxed whitespace-pre-wrap text-[var(--oterm-muted)]"
              >{{ details.diff }}</pre
            >
          </div>
        </template>
        <p v-else class="p-3 text-sm text-[var(--oterm-muted)]">Select a commit</p>
      </section>
    </div>

    <CreateBranchDialog
      :open="createDialogOpen"
      :branches="branches"
      :extra-source="createExtraSource"
      :submit-disabled="busy"
      :error="error"
      v-model:name="newBranchName"
      v-model:source="createSourceBranch"
      @confirm="submitCreateBranch"
      @cancel="closeCreateDialog"
    />

    <ConfirmDialog
      :open="confirmOpen"
      :title="pendingConfirm?.title ?? ''"
      :message="pendingConfirm?.message ?? ''"
      :confirm-label="pendingConfirm?.confirmLabel"
      :dangerous="pendingConfirm?.dangerous"
      @confirm="resolveConfirm(true)"
      @cancel="resolveConfirm(false)"
    />

    <MergeBranchDialog
      :open="mergeDialogOpen"
      :source="mergeSource"
      :target-branches="localTargetBranches"
      :default-target="defaultMergeTarget"
      :pr-available="mergePrAvailable"
      :busy="busy"
      :error="mergeError"
      @update:target="mergeTarget = $event"
      @merge-locally="confirmMergeLocally"
      @create-pr="openCreatePrFromMerge"
      @cancel="closeMergeDialog"
    />

    <CreatePullRequestDialog
      v-if="gitBranchList"
      :open="createPrOpen"
      :branches="gitBranchList"
      :busy="createPrBusy"
      :error="createPrError"
      v-model:title="createPrTitle"
      v-model:body="createPrBody"
      v-model:base="createPrBase"
      v-model:head="createPrHead"
      v-model:draft="createPrDraft"
      @confirm="submitCreatePr"
      @cancel="closeCreatePrDialog"
    />

    <BranchContextMenu
      :open="branchContextMenuOpen"
      :x="branchContextMenuX"
      :y="branchContextMenuY"
      :branch="branchContextTarget"
      :busy="busy"
      @close="closeBranchContextMenu"
      @copy-name="onBranchContextCopyName"
      @switch="onBranchContextSwitch"
      @pull="onBranchContextPull"
      @push="onBranchContextPush"
      @fetch="onBranchContextFetch"
      @create-from="onBranchContextCreateFrom"
      @merge="onBranchContextMerge"
      @delete="onBranchContextDelete"
    />
  </div>
</template>
