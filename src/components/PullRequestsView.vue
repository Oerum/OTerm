<script setup lang="ts">
import { openUrl } from "@tauri-apps/plugin-opener";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import CreatePullRequestDialog from "./CreatePullRequestDialog.vue";
import {
  switchPullRequestBranch,
  commentOnPullRequest,
  createPullRequest,
  detectPrProvider,
  getPrDiff,
  gitRemoteBrowserUrl,
  listPrChecks,
  listPrCommits,
  listPrFiles,
  listPullRequests,
  mergePullRequest,
  viewPullRequest,
} from "../lib/pullRequestApi";
import { defaultCreatePrTitle, initCreatePrBranches } from "../lib/createPrFlow";
import { getGitLog, getSourceControlStatus, listGitBranches } from "../lib/gitApi";
import { formatGitOperationError } from "../lib/formatGitError";
import { pushAppToast, setAppToastActivity } from "../lib/appToast";
import { splitUnifiedDiffByFile } from "../lib/parseUnifiedDiff";
import type { GitBranchList } from "../types/git";
import type {
  PrChangedFile,
  PrCheck,
  PrCommit,
  PrMergeMethod,
  PrProviderInfo,
  PullRequestDetail,
  PullRequestSummary,
  PullRequestTab,
} from "../types/pullRequest";
import GitDiffViewer from "./GitDiffViewer.vue";
import GitHubAvatar from "./GitHubAvatar.vue";
import MarkdownContent from "./MarkdownContent.vue";
import RepoPanelHeader from "./RepoPanelHeader.vue";
import UiGlyph from "./UiGlyph.vue";

const props = defineProps<{
  repoRoot: string;
  active?: boolean;
}>();

const emit = defineEmits<{
  refreshGit: [];
  close: [];
}>();

const provider = ref<PrProviderInfo | null>(null);
const pullRequests = ref<PullRequestSummary[]>([]);
const loading = ref(false);

const currentBranch = ref<string | null>(null);
const prSearchQuery = ref("");

const filteredPullRequests = computed(() => {
  const query = prSearchQuery.value.trim().toLowerCase();
  if (!query) return pullRequests.value;
  return pullRequests.value.filter((pr) => {
    return (
      pr.title.toLowerCase().includes(query) ||
      pr.number.toString().includes(query) ||
      pr.author.toLowerCase().includes(query) ||
      pr.headRef.toLowerCase().includes(query)
    );
  });
});

const isCurrentBranch = computed(() => {
  if (!selected.value || !currentBranch.value) return false;
  const cur = currentBranch.value.toLowerCase();
  const head = selected.value.headRef.toLowerCase();
  return cur === head || head.endsWith(":" + cur);
});

async function updateCurrentBranch() {
  try {
    const status = await getSourceControlStatus(props.repoRoot);
    currentBranch.value = status.branch;
  } catch {
    currentBranch.value = null;
  }
}
const error = ref<string | null>(null);
const tabError = ref<string | null>(null);
const includeClosed = ref(false);
const selectedNumber = ref<number | null>(null);
const showCreate = ref(false);
const createBranches = ref<GitBranchList>({ current: null, local: [], remote: [] });
const createTitle = ref("");
const createBody = ref("");
const createBase = ref("");
const createHead = ref("");
const createDraft = ref(false);
const createError = ref<string | null>(null);
const busy = ref(false);
const mergeMenuOpen = ref(false);
const deleteBranchAfterMerge = ref(true);
const mergeBusy = ref(false);

const activeTab = ref<PullRequestTab>("conversation");
const detail = ref<PullRequestDetail | null>(null);
const detailLoading = ref(false);
const commits = ref<PrCommit[]>([]);
const commitsLoading = ref(false);
const checks = ref<PrCheck[]>([]);
const checksLoading = ref(false);
const files = ref<PrChangedFile[]>([]);
const filesLoading = ref(false);
const diffContent = ref("");
const diffLoading = ref(false);
const selectedFilePath = ref<string | null>(null);
const commentBody = ref("");
const commentBusy = ref(false);

const loadedTabs = ref<Set<PullRequestTab>>(new Set());

const selected = computed(() =>
  pullRequests.value.find((pr) => pr.number === selectedNumber.value) ?? null,
);

const timelineItems = computed(() => {
  if (!detail.value) return [];
  const items: Array<
    | { kind: "comment"; key: string; author: string; body: string; at: string }
    | { kind: "review"; key: string; author: string; body: string; at: string; state: string }
  > = [];
  for (const [index, comment] of detail.value.comments.entries()) {
    items.push({
      kind: "comment",
      key: `c-${comment.author}-${comment.createdAt}-${index}`,
      author: comment.author,
      body: comment.body,
      at: comment.createdAt,
    });
  }
  for (const [index, review] of detail.value.reviews.entries()) {
    items.push({
      kind: "review",
      key: `r-${review.author}-${review.submittedAt}-${index}`,
      author: review.author,
      body: review.body,
      at: review.submittedAt,
      state: review.state,
    });
  }
  items.sort((a, b) => a.at.localeCompare(b.at));
  return items;
});

// ⚡ Bolt Optimization: Replace chained `filter().length` with single loop
// Reduces array iterations from 3x to 1x and eliminates temporary array allocations.
const checksSummary = computed(() => {
  if (checks.value.length === 0) return null;
  let fail = 0;
  let pass = 0;
  let pending = 0;
  for (const c of checks.value) {
    if (c.bucket === "fail") fail++;
    else if (c.bucket === "pass") pass++;
    else if (c.bucket === "pending") pending++;
  }
  if (fail > 0) return { label: `${fail} failed`, tone: "fail" as const };
  if (pending > 0) return { label: `${pending} pending`, tone: "pending" as const };
  if (pass > 0) return { label: `${pass} passed`, tone: "pass" as const };
  return { label: `${checks.value.length}`, tone: "neutral" as const };
});

const reviewsSorted = computed(() => {
  if (!detail.value) return [];
  return [...detail.value.reviews].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
});

// ⚡ Bolt Optimization: Replace chained `filter().length` with single loop
const reviewsSummary = computed(() => {
  const reviews = detail.value?.reviews ?? [];
  if (reviews.length === 0) return null;
  let approved = 0;
  let changes = 0;
  for (const r of reviews) {
    const upper = r.state.toUpperCase();
    if (upper.includes("APPROVED")) approved++;
    else if (upper.includes("CHANGES")) changes++;
  }
  if (changes > 0) return { label: `${changes} changes`, tone: "fail" as const };
  if (approved > 0) return { label: `${approved} approved`, tone: "pass" as const };
  return { label: `${reviews.length}`, tone: "neutral" as const };
});

const canMergePr = computed(() => {
  const pr = selected.value;
  if (!pr || busy.value || mergeBusy.value) return false;
  if (pr.state.toUpperCase() !== "OPEN" || pr.isDraft) return false;
  if (detail.value?.mergeable?.toUpperCase() === "CONFLICTING") return false;
  return true;
});

const mergeBlockedReason = computed(() => {
  const pr = selected.value;
  if (!pr) return null;
  if (pr.state.toUpperCase() !== "OPEN") return "Only open pull requests can be merged";
  if (pr.isDraft) return "Mark the draft ready before merging";
  if (detail.value?.mergeable?.toUpperCase() === "CONFLICTING") {
    return "Resolve merge conflicts before merging";
  }
  return null;
});

const fileDiffSlices = computed(() => splitUnifiedDiffByFile(diffContent.value));

const selectedFilePatch = computed(() => {
  if (!selectedFilePath.value) return "";
  return fileDiffSlices.value.find((slice) => slice.path === selectedFilePath.value)?.patch ?? "";
});

function resetTabCaches() {
  detail.value = null;
  commits.value = [];
  checks.value = [];
  files.value = [];
  diffContent.value = "";
  selectedFilePath.value = null;
  commentBody.value = "";
  tabError.value = null;
  loadedTabs.value = new Set();
}

function reviewStateClass(state: string) {
  const upper = state.toUpperCase();
  if (upper.includes("APPROVED")) return "bg-green-500/20 text-green-300";
  if (upper.includes("CHANGES")) return "bg-red-500/20 text-red-300";
  if (upper.includes("COMMENTED")) return "bg-blue-500/20 text-blue-300";
  return "bg-white/10 text-[var(--oterm-muted)]";
}

function checkBucketClass(bucket: string) {
  if (bucket === "pass") return "bg-green-500/20 text-green-300";
  if (bucket === "fail") return "bg-red-500/20 text-red-300";
  if (bucket === "pending") return "bg-yellow-500/20 text-yellow-300";
  return "bg-white/10 text-[var(--oterm-muted)]";
}

function changeTypeLabel(changeType: string) {
  const map: Record<string, string> = {
    ADDED: "added",
    DELETED: "deleted",
    RENAMED: "renamed",
    COPIED: "copied",
    MODIFIED: "modified",
    CHANGED: "changed",
  };
  return map[changeType.toUpperCase()] ?? changeType.toLowerCase();
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    provider.value = await detectPrProvider(props.repoRoot);
    if (!provider.value.authOk) {
      pullRequests.value = [];
      resetTabCaches();
      return;
    }
    pullRequests.value = await listPullRequests(props.repoRoot, includeClosed.value);
    await updateCurrentBranch();
    if (
      selectedNumber.value &&
      !pullRequests.value.some((pr) => pr.number === selectedNumber.value)
    ) {
      selectedNumber.value = pullRequests.value[0]?.number ?? null;
    } else if (!selectedNumber.value && pullRequests.value.length > 0) {
      selectedNumber.value = pullRequests.value[0].number;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function loadConversation(number: number) {
  detailLoading.value = true;
  tabError.value = null;
  try {
    const res = await viewPullRequest(props.repoRoot, number);
    if (selectedNumber.value === number) {
      detail.value = res;
      loadedTabs.value.add("conversation");
      loadedTabs.value.add("reviews");
    }
  } catch (err) {
    if (selectedNumber.value === number) {
      detail.value = null;
      tabError.value = err instanceof Error ? err.message : String(err);
    }
  } finally {
    if (selectedNumber.value === number) {
      detailLoading.value = false;
    }
  }
}

async function loadCommitsTab(number: number) {
  commitsLoading.value = true;
  tabError.value = null;
  try {
    const res = await listPrCommits(props.repoRoot, number);
    if (selectedNumber.value === number) {
      commits.value = res;
      loadedTabs.value.add("commits");
    }
  } catch (err) {
    if (selectedNumber.value === number) {
      commits.value = [];
      tabError.value = err instanceof Error ? err.message : String(err);
    }
  } finally {
    if (selectedNumber.value === number) {
      commitsLoading.value = false;
    }
  }
}

async function loadChecksTab(number: number) {
  checksLoading.value = true;
  tabError.value = null;
  try {
    const res = await listPrChecks(props.repoRoot, number);
    if (selectedNumber.value === number) {
      checks.value = res;
      loadedTabs.value.add("checks");
    }
  } catch (err) {
    if (selectedNumber.value === number) {
      checks.value = [];
      tabError.value = err instanceof Error ? err.message : String(err);
    }
  } finally {
    if (selectedNumber.value === number) {
      checksLoading.value = false;
    }
  }
}

async function loadFilesTab(number: number) {
  filesLoading.value = true;
  diffLoading.value = true;
  tabError.value = null;
  try {
    const [fileList, diff] = await Promise.all([
      listPrFiles(props.repoRoot, number),
      getPrDiff(props.repoRoot, number),
    ]);
    if (selectedNumber.value === number) {
      files.value = fileList;
      diffContent.value = diff;
      const slices = splitUnifiedDiffByFile(diff);
      selectedFilePath.value = fileList[0]?.path ?? slices[0]?.path ?? null;
      loadedTabs.value.add("files");
    }
  } catch (err) {
    if (selectedNumber.value === number) {
      files.value = [];
      diffContent.value = "";
      selectedFilePath.value = null;
      tabError.value = err instanceof Error ? err.message : String(err);
    }
  } finally {
    if (selectedNumber.value === number) {
      filesLoading.value = false;
      diffLoading.value = false;
    }
  }
}

async function ensureTabLoaded(tab: PullRequestTab, number: number) {
  if (loadedTabs.value.has(tab)) return;
  if (tab === "conversation" || tab === "reviews") await loadConversation(number);
  else if (tab === "commits") await loadCommitsTab(number);
  else if (tab === "checks") await loadChecksTab(number);
  else if (tab === "files") await loadFilesTab(number);
}

function selectTab(tab: PullRequestTab) {
  activeTab.value = tab;
  tabError.value = null;
  const number = selectedNumber.value;
  if (number) void ensureTabLoaded(tab, number);
}

async function onSwitchPullRequestBranch(pr: PullRequestSummary) {
  busy.value = true;
  error.value = null;
  try {
    await switchPullRequestBranch(props.repoRoot, pr.number);
    emit("refreshGit");
    await updateCurrentBranch();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

async function openMergeMenu() {
  if (mergeBusy.value || busy.value) return;
  const number = selectedNumber.value;
  if (!number) return;
  mergeMenuOpen.value = !mergeMenuOpen.value;
  if (mergeMenuOpen.value) {
    await ensureTabLoaded("conversation", number);
  }
}

async function onMerge(method: PrMergeMethod) {
  const pr = selected.value;
  if (!pr || !canMergePr.value) return;
  mergeMenuOpen.value = false;
  mergeBusy.value = true;
  error.value = null;
  const labels: Record<PrMergeMethod, string> = {
    merge: "Merging pull request…",
    squash: "Squash merging pull request…",
    rebase: "Rebase merging pull request…",
  };
  setAppToastActivity(labels[method]);
  try {
    await mergePullRequest(props.repoRoot, pr.number, method, deleteBranchAfterMerge.value);
    pushAppToast(`Merged #${pr.number}`, "success");
    emit("refreshGit");
    selectedNumber.value = null;
    await load();
  } catch (err) {
    const message = formatGitOperationError(err);
    error.value = message;
    pushAppToast(message, "error");
  } finally {
    setAppToastActivity(null);
    mergeBusy.value = false;
  }
}

function onMergeMenuMouseDown(event: MouseEvent) {
  if (!mergeMenuOpen.value) return;
  const target = event.target as Element | null;
  if (!target?.closest("[data-merge-menu-root]")) {
    mergeMenuOpen.value = false;
  }
}

async function onOpen(pr: PullRequestSummary) {
  await openUrl(pr.url);
}

async function onOpenCommit(oid: string) {
  const url = await gitRemoteBrowserUrl(props.repoRoot, "commit", oid);
  await openUrl(url);
}

async function openCreateDialog() {
  createError.value = null;
  busy.value = true;
  try {
    const [branchList, status, log] = await Promise.all([
      listGitBranches(props.repoRoot),
      getSourceControlStatus(props.repoRoot),
      getGitLog(props.repoRoot, 5),
    ]);
    createBranches.value = branchList;
    const { base, head } = initCreatePrBranches(branchList, status.upstream);
    createBase.value = base;
    createHead.value = head;
    createTitle.value = defaultCreatePrTitle(log, head);
    createBody.value = "";
    createDraft.value = false;
    showCreate.value = true;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

function closeCreateDialog() {
  showCreate.value = false;
  createError.value = null;
}

async function onCreate() {
  if (!createTitle.value.trim() || !createBase.value || !createHead.value) return;
  if (createBase.value === createHead.value) {
    createError.value = "Base and compare branches must be different.";
    return;
  }
  busy.value = true;
  createError.value = null;
  error.value = null;
  try {
    const created = await createPullRequest({
      repoRoot: props.repoRoot,
      title: createTitle.value.trim(),
      body: createBody.value,
      base: createBase.value,
      head: createHead.value,
      draft: createDraft.value,
    });
    closeCreateDialog();
    await load();
    selectedNumber.value = created.number;
  } catch (err) {
    createError.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

async function onSubmitComment() {
  const number = selectedNumber.value;
  const body = commentBody.value.trim();
  if (!number || !body) return;
  commentBusy.value = true;
  error.value = null;
  try {
    await commentOnPullRequest(props.repoRoot, number, body);
    commentBody.value = "";
    loadedTabs.value.delete("conversation");
    await loadConversation(number);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    commentBusy.value = false;
  }
}

onMounted(() => {
  void load();
  document.addEventListener("mousedown", onMergeMenuMouseDown);
});
onUnmounted(() => {
  document.removeEventListener("mousedown", onMergeMenuMouseDown);
});
watch(
  () => props.repoRoot,
  () => {
    resetTabCaches();
    selectedNumber.value = null;
    mergeMenuOpen.value = false;
    void load();
  },
);
watch(includeClosed, () => void load());
watch(selectedNumber, (number) => {
  resetTabCaches();
  activeTab.value = "conversation";
  mergeMenuOpen.value = false;
  if (number) void ensureTabLoaded("conversation", number);
});
watch(() => props.active, (isActive) => {
  if (isActive) {
    void load();
  }
});

</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col bg-[var(--oterm-bg)] text-[var(--oterm-text)]">
    <!-- Header -->
    <RepoPanelHeader :repo-root="repoRoot">
      <template #icon>
        <UiGlyph name="branch" :size="15" class="shrink-0 text-[var(--oterm-accent)]" />
      </template>
      <template #title>
        <h2 class="text-sm font-semibold tracking-wide">Pull Requests</h2>
      </template>
      <label class="flex cursor-pointer select-none items-center gap-2 text-xs text-[var(--oterm-muted)]">
        <input v-model="includeClosed" type="checkbox" class="cursor-pointer rounded border-[var(--oterm-border)] bg-transparent accent-[var(--oterm-accent)]" />
        Show closed
      </label>

      <div class="h-4 w-[1px] bg-[var(--oterm-border)]" />

      <button
        type="button"
        class="pr-header-btn"
        title="Refresh pull requests"
        :disabled="loading"
        @click="load"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" :class="{ 'animate-spin': loading }">
          <path d="M13.5 8a5.5 5.5 0 11-1.61-3.89L13.5 5.5m0 0V2m0 3.5H10" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Refresh
      </button>

      <button
        type="button"
        class="pr-header-btn pr-header-btn--primary"
        title="Create a new pull request"
        :disabled="!provider?.authOk || busy"
        @click="openCreateDialog"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path d="M8 3v10M3 8h10" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        New PR
      </button>

      <button
        type="button"
        class="pr-header-btn"
        title="Close PR tab"
        @click="emit('close')"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path d="M4 4l8 8M12 4L4 12" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Close
      </button>
    </RepoPanelHeader>

    <!-- Provider Warning -->
    <div v-if="provider && !provider.authOk" class="m-4 rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-elevated)] p-4 max-w-xl self-center shadow-md animate-fadeIn">
      <div class="flex items-start gap-3">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" class="text-[var(--oterm-danger)] shrink-0 mt-0.5">
          <circle cx="8" cy="8" r="6" stroke-width="1.5" />
          <path d="M8 5v4M8 11.5h.01" stroke-width="2" stroke-linecap="round" />
        </svg>
        <div>
          <h4 class="text-sm font-semibold text-[var(--oterm-text)]">Authentication / Provider Error</h4>
          <p class="mt-1 text-xs text-[var(--oterm-muted)] leading-relaxed">
            {{ provider.message ?? "Pull requests are unavailable. Please ensure you have gh or gl CLI installed and authenticated." }}
          </p>
        </div>
      </div>
    </div>

    <!-- Error state -->
    <div v-if="error" class="mx-4 mt-4 rounded-lg border border-[var(--oterm-danger)]/25 bg-[var(--oterm-danger)]/5 px-4 py-3 text-xs text-[var(--oterm-danger)] animate-fadeIn">
      <div class="flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <circle cx="8" cy="8" r="6" stroke-width="1.5" />
          <path d="M8 5v4M8 11.5h.01" stroke-width="2" stroke-linecap="round" />
        </svg>
        <span>{{ error }}</span>
      </div>
    </div>

    <CreatePullRequestDialog
      :open="showCreate"
      :branches="createBranches"
      :title="createTitle"
      :body="createBody"
      :base="createBase"
      :head="createHead"
      :draft="createDraft"
      :busy="busy"
      :error="createError"
      @update:title="createTitle = $event"
      @update:body="createBody = $event"
      @update:base="createBase = $event"
      @update:head="createHead = $event"
      @update:draft="createDraft = $event"
      @confirm="onCreate"
      @cancel="closeCreateDialog"
    />

    <!-- Main Content Grid -->
    <div class="flex min-h-0 flex-1">
      <!-- Sidebar list of PRs -->
      <aside class="w-80 shrink-0 overflow-auto border-r border-[var(--oterm-border)] bg-[var(--oterm-panel)]/30 oterm-scroll flex flex-col">
        <!-- Search bar -->
        <div v-if="pullRequests.length > 0" class="sticky top-0 z-10 shrink-0 border-b border-[var(--oterm-border)] bg-[var(--oterm-panel)]/80 backdrop-blur-md px-3 py-2">
          <div class="relative">
            <span class="absolute inset-y-0 left-0 flex items-center pl-2.5 text-[var(--oterm-faint)]">
              <UiGlyph name="list-search" :size="12" />
            </span>
            <input
              v-model="prSearchQuery"
              type="text"
              placeholder="Filter pull requests..."
              class="w-full rounded border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/40 py-1 pl-7.5 pr-2 text-xs text-[var(--oterm-text)] placeholder-[var(--oterm-faint)] outline-none focus:border-[var(--oterm-accent)]/30 transition"
            />
          </div>
        </div>

        <div v-if="loading && pullRequests.length === 0" class="flex flex-col items-center justify-center py-12 gap-2 text-xs text-[var(--oterm-faint)]">
          <svg class="animate-spin text-[var(--oterm-accent)]" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path d="M13.5 8a5.5 5.5 0 11-1.61-3.89L13.5 5.5" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <span>Loading pull requests…</span>
        </div>
        
        <div v-else class="divide-y divide-[var(--oterm-border)] overflow-y-auto flex-1 oterm-scroll">
          <button
            v-for="pr in filteredPullRequests"
            :key="pr.number"
            type="button"
            class="pr-list-card block w-full px-4 py-3.5 text-left transition duration-150 ease-in-out hover:bg-white/[0.015]"
            :class="selectedNumber === pr.number ? 'pr-list-card--active bg-white/[0.025]' : ''"
            @click="selectedNumber = pr.number"
          >
            <div class="flex items-start gap-3">
              <GitHubAvatar :login="pr.author" size-class="h-7 w-7" text-class="text-[10px]" :size-px="56" />
              
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-xs font-semibold text-[var(--oterm-faint)] font-mono">#{{ pr.number }}</span>
                  <span
                    class="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                    :class="
                      pr.state === 'OPEN'
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : pr.state === 'MERGED'
                        ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        : 'bg-white/5 text-[var(--oterm-muted)] border border-white/10'
                    "
                  >
                    {{ pr.state }}
                  </span>
                  <span v-if="pr.isDraft" class="rounded bg-white/5 border border-white/10 px-1 py-0.5 text-[9px] font-semibold text-[var(--oterm-muted)] uppercase tracking-wider">draft</span>
                </div>
                <div class="mt-1.5 line-clamp-2 text-xs font-semibold text-[var(--oterm-text)] leading-snug">
                  {{ pr.title }}
                </div>
                <div class="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--oterm-faint)]">
                  <span class="font-mono bg-white/5 px-1.5 py-0.5 rounded truncate max-w-[90px]">{{ pr.headRef }}</span>
                  <span>→</span>
                  <span class="font-mono bg-white/5 px-1.5 py-0.5 rounded truncate max-w-[90px]">{{ pr.baseRef }}</span>
                </div>
              </div>
            </div>
          </button>
        </div>
        
        <div
          v-if="!loading && pullRequests.length === 0 && provider?.authOk"
          class="flex flex-col items-center justify-center py-12 gap-1.5 text-xs text-[var(--oterm-faint)]"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <circle cx="8" cy="8" r="6" stroke-width="1.5" />
            <path d="M8 11.5h.01M8 5v4" stroke-width="2" stroke-linecap="round" />
          </svg>
          <span>No pull requests found</span>
        </div>
      </aside>

      <!-- Selected PR Details -->
      <section v-if="selected" class="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--oterm-panel)]/10 animate-fadeIn duration-150">
        <!-- PR Header Details -->
        <div class="shrink-0 border-b border-[var(--oterm-border)] px-5 py-4 bg-[var(--oterm-panel)]/30">
          <div class="flex items-start gap-4">
            <GitHubAvatar
              :login="selected.author"
              size-class="h-10 w-10"
              text-class="text-xs"
              :size-px="80"
            />
            
            <div class="min-w-0 flex-1">
              <h3 class="text-base font-semibold text-[var(--oterm-text)] leading-snug">{{ selected.title }}</h3>
              <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--oterm-muted)]">
                <span class="font-mono text-[var(--oterm-faint)]">#{{ selected.number }}</span>
                <span>·</span>
                <span class="font-medium text-[var(--oterm-text)]">{{ selected.author }}</span>
                <span>·</span>
                <span class="flex items-center gap-1">
                  <span class="font-mono bg-white/5 px-1 py-0.5 rounded truncate max-w-[120px]">{{ selected.headRef }}</span>
                  <span class="text-[var(--oterm-faint)]">→</span>
                  <span class="font-mono bg-white/5 px-1 py-0.5 rounded truncate max-w-[120px]">{{ selected.baseRef }}</span>
                </span>
              </p>
            </div>
            
            <!-- PR Actions -->
            <div class="flex shrink-0 items-center gap-2">
              <button
                type="button"
                class="pr-action-btn"
                title="Open PR in browser"
                @click="onOpen(selected)"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                  <path d="M9.5 3.5h3v3M6.5 9.5l6-6M11.5 9v3.5a1 1 0 01-1 1h-7a1 1 0 01-1-1v-7a1 1 0 011-1H7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                Open Browser
              </button>
              <button
                type="button"
                class="pr-action-btn"
                :class="isCurrentBranch ? 'pr-action-btn--active-branch' : 'pr-action-btn--primary'"
                title="Checkout PR head branch locally"
                :disabled="busy || mergeBusy || isCurrentBranch"
                @click="onSwitchPullRequestBranch(selected)"
              >
                <svg v-if="isCurrentBranch" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                  <path d="M13.5 4.5l-7 7-3.5-3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <svg v-else width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" :class="{ 'animate-spin': busy }">
                  <path d="M5 4.5a2.5 2.5 0 100 5v2.5M11 11.5a2.5 2.5 0 100-5v-2.5M5 7h6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                {{ isCurrentBranch ? 'Active Branch' : 'Checkout Branch' }}
              </button>
              <div
                v-if="selected.state.toUpperCase() === 'OPEN'"
                class="relative"
                data-merge-menu-root
              >
                <button
                  type="button"
                  class="pr-action-btn pr-action-btn--primary"
                  :class="{ 'opacity-70': !canMergePr && !mergeBusy }"
                  :title="mergeBlockedReason ?? 'Merge pull request'"
                  :disabled="mergeBusy || busy"
                  @click.stop="openMergeMenu"
                >
                  <svg
                    v-if="mergeBusy"
                    class="animate-spin"
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path d="M13.5 8a5.5 5.5 0 11-1.61-3.89L13.5 5.5" stroke-width="1.5" stroke-linecap="round" />
                  </svg>
                  <svg v-else width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                    <path d="M4 8h8M8 4v8" stroke-width="1.5" stroke-linecap="round" />
                    <path d="M3 12.5h10" stroke-width="1.5" stroke-linecap="round" />
                  </svg>
                  {{ mergeBusy ? "Merging…" : "Merge" }}
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" class="opacity-70">
                    <path d="M2 3l2 2 2-2" stroke-width="1.2" stroke-linecap="round" />
                  </svg>
                </button>
                <div
                  v-if="mergeMenuOpen"
                  class="absolute right-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-md border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] py-1 shadow-lg"
                >
                  <p
                    v-if="mergeBlockedReason"
                    class="px-3 py-2 text-[11px] text-[var(--oterm-danger)] border-b border-[var(--oterm-border)]"
                  >
                    {{ mergeBlockedReason }}
                  </p>
                  <button
                    type="button"
                    class="block w-full px-3 py-2 text-left hover:bg-white/5 disabled:opacity-40 disabled:pointer-events-none"
                    :disabled="!canMergePr"
                    @click="onMerge('merge')"
                  >
                    <span class="block text-xs font-medium text-[var(--oterm-text)]">Create a merge commit</span>
                    <span class="mt-0.5 block text-[10px] text-[var(--oterm-faint)] leading-snug">
                      All commits from this branch will be added to the base branch via a merge commit.
                    </span>
                  </button>
                  <button
                    type="button"
                    class="block w-full px-3 py-2 text-left hover:bg-white/5 disabled:opacity-40 disabled:pointer-events-none"
                    :disabled="!canMergePr"
                    @click="onMerge('squash')"
                  >
                    <span class="block text-xs font-medium text-[var(--oterm-text)]">Squash and merge</span>
                    <span class="mt-0.5 block text-[10px] text-[var(--oterm-faint)] leading-snug">
                      The commits from this branch will be combined into one commit in the base branch.
                    </span>
                  </button>
                  <button
                    type="button"
                    class="block w-full px-3 py-2 text-left hover:bg-white/5 disabled:opacity-40 disabled:pointer-events-none"
                    :disabled="!canMergePr"
                    @click="onMerge('rebase')"
                  >
                    <span class="block text-xs font-medium text-[var(--oterm-text)]">Rebase and merge</span>
                    <span class="mt-0.5 block text-[10px] text-[var(--oterm-faint)] leading-snug">
                      The commits from this branch will be rebased and added to the base branch.
                    </span>
                  </button>
                  <label
                    class="flex items-center gap-2 border-t border-[var(--oterm-border)] px-3 py-2 text-[11px] text-[var(--oterm-muted)] cursor-pointer hover:bg-white/5"
                  >
                    <input
                      v-model="deleteBranchAfterMerge"
                      type="checkbox"
                      class="rounded border-[var(--oterm-border)]"
                    />
                    Delete branch after merge
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- PR Tabs Navigation -->
        <nav class="flex shrink-0 gap-2 border-b border-[var(--oterm-border)] px-4 bg-[var(--oterm-panel)]/15">
          <button
            type="button"
            class="pr-tab-btn"
            :class="{ 'pr-tab-btn--active': activeTab === 'conversation' }"
            @click="selectTab('conversation')"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="M2.5 13.5V3.5a1 1 0 011-1h9a1 1 0 011 1v7a1 1 0 01-1 1h-6.5L2.5 13.5z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Conversation
          </button>

          <button
            type="button"
            class="pr-tab-btn"
            :class="{ 'pr-tab-btn--active': activeTab === 'reviews' }"
            @click="selectTab('reviews')"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="M8 2l1.5 3.5L13 6l-2.5 2.5L11 12l-3-1.5L5 12l.5-3.5L3 6l3.5-.5L8 2z" stroke-width="1.5" stroke-linejoin="round" />
            </svg>
            Reviews
            <span
              v-if="reviewsSummary"
              class="pr-tab-badge"
              :class="checkBucketClass(reviewsSummary.tone === 'neutral' ? '' : reviewsSummary.tone)"
            >
              {{ reviewsSummary.label }}
            </span>
          </button>
          
          <button
            type="button"
            class="pr-tab-btn"
            :class="{ 'pr-tab-btn--active': activeTab === 'commits' }"
            @click="selectTab('commits')"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <circle cx="8" cy="8" r="3" stroke-width="1.5" />
              <path d="M8 2v3M8 11v3" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            Commits
            <span v-if="commits.length" class="pr-tab-badge">{{ commits.length }}</span>
          </button>
          
          <button
            type="button"
            class="pr-tab-btn"
            :class="{ 'pr-tab-btn--active': activeTab === 'checks' }"
            @click="selectTab('checks')"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <circle cx="8" cy="8" r="6" stroke-width="1.5" />
              <path d="M5.5 8.5l1.5 1.5 3.5-4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Checks
            <span
              v-if="checksSummary"
              class="pr-tab-badge"
              :class="checkBucketClass(checksSummary.tone === 'neutral' ? '' : checksSummary.tone)"
            >
              {{ checksSummary.label }}
            </span>
          </button>
          
          <button
            type="button"
            class="pr-tab-btn"
            :class="{ 'pr-tab-btn--active': activeTab === 'files' }"
            @click="selectTab('files')"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="M3 2v12h10V5L10 2H3z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M10 2v3h3" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Files Changed
            <span v-if="files.length || detail?.changedFiles" class="pr-tab-badge">
              {{ files.length || detail?.changedFiles }}
            </span>
          </button>
        </nav>

        <!-- PR Content Pane -->
        <div class="min-h-0 flex-1 overflow-auto oterm-scroll">
          <p v-if="tabError" class="px-5 py-3 text-xs text-[var(--oterm-danger)] bg-[var(--oterm-danger)]/5 border-b border-[var(--oterm-danger)]/15">
            {{ tabError }}
          </p>

          <!-- Conversation -->
          <div v-if="activeTab === 'conversation'" class="p-5 space-y-6 max-w-4xl">
            <div v-if="detailLoading" class="flex items-center gap-2 py-4 text-xs text-[var(--oterm-faint)]">
              <UiGlyph name="spinner-arc" :size="14" class="text-[var(--oterm-faint)]" />
              <span>Loading details…</span>
            </div>
            
            <template v-else-if="detail">
              <!-- Description Card -->
              <div class="rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-panel)]/20 p-4 shadow-sm animate-fadeIn">
                <h4 class="text-[10px] font-bold uppercase tracking-wider text-[var(--oterm-faint)] mb-2">Description</h4>
                <MarkdownContent class="text-xs text-[var(--oterm-text)] leading-relaxed" :source="detail.body" empty-text="No description." />
                
                <div v-if="detail.additions || detail.deletions" class="mt-4 pt-3 border-t border-[var(--oterm-border)] flex items-center gap-3 text-[11px] text-[var(--oterm-muted)] font-mono">
                  <span class="flex items-center gap-1">
                    <span class="text-[var(--diff-insert-text)]">+{{ detail.additions }}</span>
                    <span class="text-[var(--diff-remove-text)]">-{{ detail.deletions }}</span>
                  </span>
                  <span class="text-[var(--oterm-faint)]">·</span>
                  <span>{{ detail.changedFiles }} files changed</span>
                </div>
              </div>

              <!-- Timeline thread -->
              <div v-if="timelineItems.length" class="space-y-4">
                <h4 class="text-[10px] font-bold uppercase tracking-wider text-[var(--oterm-faint)]">Activity Thread</h4>
                
                <div class="relative border-l border-[var(--oterm-border)] ml-3.5 pl-5 space-y-5 py-1">
                  <article
                    v-for="item in timelineItems"
                    :key="item.key"
                    class="relative flex gap-3 rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-panel)]/10 p-3 shadow-sm transition hover:border-[var(--oterm-border-strong)]"
                  >
                    <!-- Timeline circle anchor -->
                    <span class="absolute -left-[27.5px] top-4.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--oterm-panel)] border border-[var(--oterm-border)]">
                      <span class="h-1.5 w-1.5 rounded-full bg-[var(--oterm-faint)]" />
                    </span>

                    <GitHubAvatar :login="item.author" size-class="h-7 w-7" text-class="text-[10px]" :size-px="56" />
                    
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--oterm-muted)]">
                        <span class="font-semibold text-[var(--oterm-text)]">{{ item.author }}</span>
                        <span>·</span>
                        <span class="text-[10px] text-[var(--oterm-faint)]">{{ item.at }}</span>
                        <span
                          v-if="item.kind === 'review'"
                          class="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                          :class="reviewStateClass(item.state)"
                        >
                          {{ item.state }}
                        </span>
                      </div>
                      <MarkdownContent
                        v-if="item.body.trim()"
                        class="mt-2 text-xs text-[var(--oterm-text)] leading-relaxed"
                        :source="item.body"
                        empty-text=""
                      />
                    </div>
                  </article>
                </div>
              </div>

              <!-- Add Comment block -->
              <div class="rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-panel)]/30 p-4 shadow-sm animate-fadeIn">
                <h4 class="text-[10px] font-bold uppercase tracking-wider text-[var(--oterm-faint)] mb-2">Leave a Comment</h4>
                <textarea
                  v-model="commentBody"
                  rows="3"
                  placeholder="Type comment (Markdown supported)..."
                  class="w-full rounded border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/30 px-3 py-2 text-xs text-[var(--oterm-text)] outline-none focus:border-[var(--oterm-accent)]/30 transition duration-150"
                />
                <div class="mt-2.5 flex justify-end">
                  <button
                    type="button"
                    class="pr-action-btn pr-action-btn--primary"
                    :disabled="commentBusy || !commentBody.trim()"
                    @click="onSubmitComment"
                  >
                    <span v-if="commentBusy" class="diff-gutter-spinner mr-1" />
                    Comment
                  </button>
                </div>
              </div>
            </template>
          </div>

          <!-- Reviews -->
          <div v-else-if="activeTab === 'reviews'" class="p-5 max-w-4xl">
            <div v-if="detailLoading" class="flex items-center gap-2 py-4 text-xs text-[var(--oterm-faint)]">
              <UiGlyph name="spinner-arc" :size="14" class="text-[var(--oterm-faint)]" />
              <span>Loading reviews…</span>
            </div>

            <p v-else-if="!reviewsSorted.length" class="text-xs text-[var(--oterm-faint)] py-4">
              No reviews yet.
            </p>

            <ul v-else class="space-y-4">
              <li
                v-for="(review, index) in reviewsSorted"
                :key="`review-${review.author}-${review.submittedAt}-${index}`"
                class="flex gap-3 rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-panel)]/10 p-3.5 shadow-sm hover:border-[var(--oterm-border-strong)] transition"
              >
                <GitHubAvatar :login="review.author" size-class="h-7 w-7" text-class="text-[10px]" :size-px="56" />
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--oterm-muted)]">
                    <span class="font-semibold text-[var(--oterm-text)]">{{ review.author }}</span>
                    <span>·</span>
                    <span class="text-[10px] text-[var(--oterm-faint)]">{{ review.submittedAt }}</span>
                    <span
                      class="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                      :class="reviewStateClass(review.state)"
                    >
                      {{ review.state }}
                    </span>
                  </div>
                  <MarkdownContent
                    v-if="review.body.trim()"
                    class="mt-2 text-xs text-[var(--oterm-text)] leading-relaxed"
                    :source="review.body"
                    empty-text=""
                  />
                  <p v-else class="mt-2 text-[11px] text-[var(--oterm-faint)] italic">No review comment.</p>
                </div>
              </li>
            </ul>
          </div>

          <!-- Commits -->
          <div v-else-if="activeTab === 'commits'" class="p-5 max-w-4xl">
            <div v-if="commitsLoading" class="flex items-center gap-2 text-xs text-[var(--oterm-faint)] py-4">
              <svg class="animate-spin text-[var(--oterm-faint)]" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <path d="M13.5 8a5.5 5.5 0 11-1.61-3.89L13.5 5.5" stroke-width="1.5" stroke-linecap="round" />
              </svg>
              <span>Loading commits…</span>
            </div>
            
            <ul v-else-if="commits.length" class="relative border-l border-[var(--oterm-border)] ml-3 pl-5 space-y-4 py-1">
              <li
                v-for="commit in commits"
                :key="commit.oid"
                class="relative flex items-start gap-3"
              >
                <!-- Timeline Node Circle -->
                <span class="absolute -left-[27.5px] top-3 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--oterm-panel)] border border-[var(--oterm-border)]">
                  <span class="h-1.5 w-1.5 rounded-full bg-[var(--oterm-faint)]" />
                </span>
                
                <div class="min-w-0 flex-1 rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-panel)]/10 px-3.5 py-3 shadow-sm hover:border-[var(--oterm-border-strong)] transition">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="font-medium text-xs text-[var(--oterm-text)]">{{ commit.messageHeadline }}</p>
                      <p v-if="commit.messageBody" class="mt-1 text-[11px] text-[var(--oterm-muted)] leading-relaxed whitespace-pre-wrap">
                        {{ commit.messageBody }}
                      </p>
                      <p class="mt-1 text-[10px] text-[var(--oterm-faint)] font-mono">
                        {{ commit.author }} · {{ commit.committedDate }}
                      </p>
                    </div>
                    <button
                      type="button"
                      class="shrink-0 rounded border border-[var(--oterm-border)] bg-white/[0.02] px-2 py-0.5 font-mono text-[10px] text-[var(--oterm-muted)] hover:bg-white/5 transition"
                      @click="onOpenCommit(commit.oid)"
                    >
                      {{ commit.shortOid }}
                    </button>
                  </div>
                </div>
              </li>
            </ul>
            
            <p v-else class="text-xs text-[var(--oterm-muted)] py-4">No commits found.</p>
          </div>

          <!-- Checks -->
          <div v-else-if="activeTab === 'checks'" class="p-5 max-w-4xl">
            <div v-if="checksLoading" class="flex items-center gap-2 text-xs text-[var(--oterm-faint)] py-4">
              <svg class="animate-spin text-[var(--oterm-faint)]" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <path d="M13.5 8a5.5 5.5 0 11-1.61-3.89L13.5 5.5" stroke-width="1.5" stroke-linecap="round" />
              </svg>
              <span>Loading checks…</span>
            </div>
            
            <ul v-else-if="checks.length" class="space-y-3">
              <li
                v-for="(check, index) in checks"
                :key="`${check.name}-${check.startedAt}-${check.workflow}-${index}`"
                class="flex items-center gap-4 rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-panel)]/10 px-4 py-3.5 shadow-sm hover:border-[var(--oterm-border-strong)] transition duration-150"
              >
                <!-- Status icon indicator -->
                <span class="shrink-0 flex items-center justify-center">
                  <svg v-if="check.bucket === 'pass'" class="text-green-400" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                    <circle cx="8" cy="8" r="6" stroke-width="1.5" />
                    <path d="M5.5 8.5l1.5 1.5 3.5-4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <svg v-else-if="check.bucket === 'fail'" class="text-red-400" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                    <circle cx="8" cy="8" r="6" stroke-width="1.5" />
                    <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <svg v-else class="text-yellow-400 animate-pulse" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                    <circle cx="8" cy="8" r="6" stroke-width="1.5" />
                    <path d="M8 4v4M10 8H8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </span>
                
                <div class="min-w-0 flex-1">
                  <p class="truncate font-semibold text-xs text-[var(--oterm-text)]">{{ check.name }}</p>
                  <p v-if="check.description" class="truncate text-[11px] text-[var(--oterm-muted)] mt-0.5">
                    {{ check.description }}
                  </p>
                  <p v-if="check.workflow" class="text-[10px] text-[var(--oterm-faint)] font-mono mt-0.5">
                    {{ check.workflow }}
                  </p>
                </div>
                <a
                  v-if="check.link"
                  :href="check.link"
                  class="shrink-0 flex items-center gap-1 text-[11px] text-[var(--oterm-accent)] hover:underline font-medium"
                  @click.prevent="openUrl(check.link!)"
                >
                  Details
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                    <path d="M9.5 3.5h3v3M6.5 9.5l6-6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </a>
              </li>
            </ul>
            
            <p v-else class="text-xs text-[var(--oterm-muted)] py-4">No checks reported.</p>
          </div>

          <!-- Files changed -->
          <div v-else-if="activeTab === 'files'" class="flex min-h-0 h-full border-t border-[var(--oterm-border)]">
            <aside
              class="w-64 shrink-0 overflow-auto border-r border-[var(--oterm-border)] bg-[var(--oterm-panel)]/30 p-2 oterm-scroll"
            >
              <p v-if="filesLoading" class="p-2 text-xs text-[var(--oterm-faint)]">Loading files…</p>
              <button
                v-for="file in files"
                :key="file.path"
                type="button"
                class="mb-1 block w-full rounded px-2.5 py-2 text-left text-xs transition duration-100"
                :class="selectedFilePath === file.path ? 'bg-white/5 border-l-2 border-l-[var(--oterm-accent)] pl-[8px]' : 'hover:bg-white/[0.015] border-l-2 border-l-transparent'"
                @click="selectedFilePath = file.path"
              >
                <span class="block truncate font-medium text-[var(--oterm-text)]" :title="file.path">{{ file.path }}</span>
                <span class="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--oterm-muted)] font-mono">
                  <span class="text-green-400">+{{ file.additions }}</span>
                  <span class="text-red-400"> −{{ file.deletions }}</span>
                  <span class="text-[var(--oterm-faint)]">·</span>
                  <span class="rounded bg-white/5 px-1 uppercase text-[8px] tracking-wide">{{ changeTypeLabel(file.changeType) }}</span>
                </span>
              </button>
              <p v-if="!filesLoading && files.length === 0" class="p-2 text-xs text-[var(--oterm-faint)]">
                No changed files.
              </p>
            </aside>
            <div class="min-h-0 min-w-0 flex-1 bg-[var(--oterm-bg)]">
              <GitDiffViewer
                :content="selectedFilePatch"
                :loading="diffLoading"
                class="h-full"
              />
              <p
                v-if="!diffLoading && selectedFilePath && !selectedFilePatch"
                class="p-4 text-xs text-[var(--oterm-faint)]"
              >
                No diff available for this file.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        v-else-if="!loading && provider?.authOk"
        class="flex flex-1 flex-col items-center justify-center text-xs text-[var(--oterm-faint)] gap-1.5 bg-[var(--oterm-panel)]/5 animate-fadeIn"
      >
        <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path d="M5 4.5a2.5 2.5 0 100 5v2.5M11 11.5a2.5 2.5 0 100-5v-2.5M5 7h6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>Select a pull request from the list to view conversations, checks, and changes</span>
      </section>
    </div>
  </div>
</template>

<style scoped>
.pr-header-btn--primary {
  background: var(--oterm-accent-dim);
  border-color: color-mix(in srgb, var(--oterm-accent) 25%, transparent);
  color: var(--oterm-accent);
}

.pr-header-btn--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--oterm-accent) 18%, transparent);
  color: var(--oterm-accent);
  border-color: color-mix(in srgb, var(--oterm-accent) 40%, transparent);
}

.pr-header-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pr-list-card {
  border-left: 2px solid transparent;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.pr-list-card--active {
  border-left-color: var(--oterm-accent);
  box-shadow: inset 4px 0 10px rgba(0, 229, 186, 0.015);
}

.pr-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 11px;
  font-family: var(--oterm-font-ui);
  font-weight: 500;
  color: var(--oterm-muted);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--oterm-border);
  cursor: pointer;
  transition: all 150ms ease;
}

.pr-action-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: var(--oterm-text);
}

.pr-action-btn--primary {
  background: rgba(255, 255, 255, 0.04);
  color: var(--oterm-text);
  border-color: rgba(255, 255, 255, 0.08);
}

.pr-action-btn--primary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.09);
  border-color: rgba(255, 255, 255, 0.15);
}

.pr-action-btn--active-branch {
  background: rgba(34, 197, 94, 0.1) !important;
  color: rgb(74, 222, 128) !important;
  border-color: rgba(34, 197, 94, 0.3) !important;
  opacity: 1 !important;
  cursor: default;
}

.pr-action-btn:disabled {
  opacity: 0.45;
}

.pr-tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 11px;
  font-family: var(--oterm-font-ui);
  font-weight: 500;
  color: var(--oterm-muted);
  border-bottom: 2px solid transparent;
  transition: all 150ms ease;
  cursor: pointer;
}

.pr-tab-btn:hover {
  color: var(--oterm-text);
}

.pr-tab-btn--active {
  border-bottom-color: var(--oterm-accent);
  color: var(--oterm-text);
}

.pr-tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 9px;
  font-family: var(--oterm-font-mono);
  background: rgba(255, 255, 255, 0.06);
  color: var(--oterm-muted);
}

.pr-tab-btn--active .pr-tab-badge {
  background: rgba(255, 255, 255, 0.12);
  color: var(--oterm-text);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeIn {
  animation: fadeIn 180ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
</style>
