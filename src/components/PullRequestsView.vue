<script setup lang="ts">
import { openUrl } from "@tauri-apps/plugin-opener";
import { computed, onMounted, ref, watch } from "vue";
import {
  checkoutPullRequest,
  commentOnPullRequest,
  createPullRequest,
  detectPrProvider,
  getPrDiff,
  gitRemoteBrowserUrl,
  listPrChecks,
  listPrCommits,
  listPrFiles,
  listPullRequests,
  viewPullRequest,
} from "../lib/pullRequestApi";
import { splitUnifiedDiffByFile } from "../lib/parseUnifiedDiff";
import type {
  PrChangedFile,
  PrCheck,
  PrCommit,
  PrProviderInfo,
  PullRequestDetail,
  PullRequestSummary,
  PullRequestTab,
} from "../types/pullRequest";
import GitDiffViewer from "./GitDiffViewer.vue";
import MarkdownContent from "./MarkdownContent.vue";

const props = defineProps<{
  repoRoot: string;
}>();

const emit = defineEmits<{
  refreshGit: [];
  close: [];
}>();

const provider = ref<PrProviderInfo | null>(null);
const pullRequests = ref<PullRequestSummary[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const tabError = ref<string | null>(null);
const includeClosed = ref(false);
const selectedNumber = ref<number | null>(null);
const showCreate = ref(false);
const createTitle = ref("");
const createBody = ref("");
const createDraft = ref(false);
const busy = ref(false);

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

const checksSummary = computed(() => {
  if (checks.value.length === 0) return null;
  const fail = checks.value.filter((c) => c.bucket === "fail").length;
  const pass = checks.value.filter((c) => c.bucket === "pass").length;
  const pending = checks.value.filter((c) => c.bucket === "pending").length;
  if (fail > 0) return { label: `${fail} failed`, tone: "fail" as const };
  if (pending > 0) return { label: `${pending} pending`, tone: "pending" as const };
  if (pass > 0) return { label: `${pass} passed`, tone: "pass" as const };
  return { label: `${checks.value.length}`, tone: "neutral" as const };
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
  if (tab === "conversation") await loadConversation(number);
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

async function onCheckout(pr: PullRequestSummary) {
  busy.value = true;
  error.value = null;
  try {
    await checkoutPullRequest(props.repoRoot, pr.number);
    emit("refreshGit");
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

async function onOpen(pr: PullRequestSummary) {
  await openUrl(pr.url);
}

async function onOpenCommit(oid: string) {
  const url = await gitRemoteBrowserUrl(props.repoRoot, "commit", oid);
  await openUrl(url);
}

async function onCreate() {
  if (!createTitle.value.trim()) return;
  busy.value = true;
  error.value = null;
  try {
    const created = await createPullRequest({
      repoRoot: props.repoRoot,
      title: createTitle.value,
      body: createBody.value,
      draft: createDraft.value,
    });
    showCreate.value = false;
    createTitle.value = "";
    createBody.value = "";
    createDraft.value = false;
    await load();
    selectedNumber.value = created.number;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
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

onMounted(() => void load());
watch(() => props.repoRoot, () => {
  resetTabCaches();
  selectedNumber.value = null;
  void load();
});
watch(includeClosed, () => void load());
watch(selectedNumber, (number) => {
  resetTabCaches();
  activeTab.value = "conversation";
  if (number) void ensureTabLoaded("conversation", number);
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-[var(--oterm-bg)] text-[var(--oterm-text)]">
    <header
      class="flex shrink-0 items-center gap-2 border-b border-[var(--oterm-border)] px-4 py-2"
    >
      <h2 class="text-sm font-medium">Pull Requests</h2>
      <span class="truncate text-xs text-[var(--oterm-muted)]">{{ repoRoot }}</span>
      <div class="flex-1" />
      <label class="flex items-center gap-1.5 text-xs text-[var(--oterm-muted)]">
        <input v-model="includeClosed" type="checkbox" class="accent-[var(--oterm-accent)]" />
        Show closed
      </label>
      <button
        type="button"
        class="rounded-md border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5"
        :disabled="loading"
        @click="load"
      >
        Refresh
      </button>
      <button
        type="button"
        class="rounded-md bg-[var(--oterm-accent)] px-2 py-1 text-xs text-black disabled:opacity-50"
        :disabled="!provider?.authOk || busy"
        @click="showCreate = true"
      >
        New PR
      </button>
      <button
        type="button"
        class="rounded-md border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5"
        @click="emit('close')"
      >
        Close tab
      </button>
    </header>

    <p v-if="provider && !provider.authOk" class="px-4 py-3 text-sm text-[var(--oterm-muted)]">
      {{ provider.message ?? "Pull requests are unavailable for this repository." }}
    </p>

    <p v-if="error" class="px-4 py-2 text-sm text-[var(--oterm-danger)]">{{ error }}</p>

    <div v-if="showCreate" class="border-b border-[var(--oterm-border)] px-4 py-3">
      <input
        v-model="createTitle"
        type="text"
        placeholder="PR title"
        class="mb-2 w-full rounded border border-[var(--oterm-border)] bg-transparent px-2 py-1 text-sm"
      />
      <textarea
        v-model="createBody"
        rows="4"
        placeholder="Description"
        class="mb-2 w-full rounded border border-[var(--oterm-border)] bg-transparent px-2 py-1 text-sm"
      />
      <label class="mb-2 flex items-center gap-2 text-xs text-[var(--oterm-muted)]">
        <input v-model="createDraft" type="checkbox" class="accent-[var(--oterm-accent)]" />
        Create as draft
      </label>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded bg-[var(--oterm-accent)] px-3 py-1 text-xs text-black"
          :disabled="busy"
          @click="onCreate"
        >
          Create
        </button>
        <button
          type="button"
          class="rounded border border-[var(--oterm-border)] px-3 py-1 text-xs"
          @click="showCreate = false"
        >
          Cancel
        </button>
      </div>
    </div>

    <div class="flex min-h-0 flex-1">
      <aside class="w-80 shrink-0 overflow-auto border-r border-[var(--oterm-border)]">
        <p v-if="loading" class="p-4 text-xs text-[var(--oterm-muted)]">Loading…</p>
        <button
          v-for="pr in pullRequests"
          :key="pr.number"
          type="button"
          class="block w-full border-b border-[var(--oterm-border)] px-3 py-2 text-left text-sm transition hover:bg-white/5"
          :class="selectedNumber === pr.number ? 'bg-white/5' : ''"
          @click="selectedNumber = pr.number"
        >
          <div class="flex items-center gap-2">
            <span class="text-[var(--oterm-muted)]">#{{ pr.number }}</span>
            <span
              class="rounded px-1 text-[10px] uppercase"
              :class="
                pr.state === 'OPEN'
                  ? 'bg-green-500/20 text-green-300'
                  : 'bg-white/10 text-[var(--oterm-muted)]'
              "
            >
              {{ pr.state }}
            </span>
            <span v-if="pr.isDraft" class="text-[10px] text-[var(--oterm-muted)]">draft</span>
          </div>
          <div class="mt-1 truncate font-medium">{{ pr.title }}</div>
          <div class="mt-0.5 truncate text-xs text-[var(--oterm-muted)]">
            {{ pr.headRef }} → {{ pr.baseRef }}
          </div>
        </button>
        <p
          v-if="!loading && pullRequests.length === 0 && provider?.authOk"
          class="p-4 text-xs text-[var(--oterm-muted)]"
        >
          No pull requests found.
        </p>
      </aside>

      <section v-if="selected" class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="shrink-0 border-b border-[var(--oterm-border)] px-4 py-3">
          <h3 class="text-lg font-medium">{{ selected.title }}</h3>
          <p class="mt-1 text-sm text-[var(--oterm-muted)]">
            #{{ selected.number }} · {{ selected.author }} · {{ selected.headRef }} →
            {{ selected.baseRef }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded border border-[var(--oterm-border)] px-3 py-1 text-xs hover:bg-white/5"
              @click="onOpen(selected)"
            >
              Open in browser
            </button>
            <button
              type="button"
              class="rounded border border-[var(--oterm-border)] px-3 py-1 text-xs hover:bg-white/5"
              :disabled="busy"
              @click="onCheckout(selected)"
            >
              Checkout branch
            </button>
          </div>
        </div>

        <nav
          class="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--oterm-border)] px-4"
        >
          <button
            type="button"
            class="border-b-2 px-3 py-2 text-xs transition"
            :class="
              activeTab === 'conversation'
                ? 'border-[var(--oterm-accent)] text-[var(--oterm-text)]'
                : 'border-transparent text-[var(--oterm-muted)] hover:text-[var(--oterm-text)]'
            "
            @click="selectTab('conversation')"
          >
            Conversation
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs transition"
            :class="
              activeTab === 'commits'
                ? 'border-[var(--oterm-accent)] text-[var(--oterm-text)]'
                : 'border-transparent text-[var(--oterm-muted)] hover:text-[var(--oterm-text)]'
            "
            @click="selectTab('commits')"
          >
            Commits
            <span
              v-if="commits.length"
              class="rounded bg-white/10 px-1 text-[10px] text-[var(--oterm-muted)]"
            >
              {{ commits.length }}
            </span>
            <span
              v-else-if="detail?.changedFiles === undefined && !commitsLoading"
              class="hidden"
            />
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs transition"
            :class="
              activeTab === 'checks'
                ? 'border-[var(--oterm-accent)] text-[var(--oterm-text)]'
                : 'border-transparent text-[var(--oterm-muted)] hover:text-[var(--oterm-text)]'
            "
            @click="selectTab('checks')"
          >
            Checks
            <span
              v-if="checksSummary"
              class="rounded px-1 text-[10px]"
              :class="checkBucketClass(checksSummary.tone === 'neutral' ? '' : checksSummary.tone)"
            >
              {{ checksSummary.label }}
            </span>
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs transition"
            :class="
              activeTab === 'files'
                ? 'border-[var(--oterm-accent)] text-[var(--oterm-text)]'
                : 'border-transparent text-[var(--oterm-muted)] hover:text-[var(--oterm-text)]'
            "
            @click="selectTab('files')"
          >
            Files changed
            <span
              v-if="files.length || detail?.changedFiles"
              class="rounded bg-white/10 px-1 text-[10px] text-[var(--oterm-muted)]"
            >
              {{ files.length || detail?.changedFiles }}
            </span>
          </button>
        </nav>

        <div class="min-h-0 flex-1 overflow-auto">
          <p v-if="tabError" class="px-4 py-2 text-sm text-[var(--oterm-danger)]">{{ tabError }}</p>

          <!-- Conversation -->
          <div v-if="activeTab === 'conversation'" class="p-4">
            <p v-if="detailLoading" class="text-xs text-[var(--oterm-muted)]">Loading…</p>
            <template v-else-if="detail">
              <div>
                <h4 class="text-xs font-medium uppercase tracking-wide text-[var(--oterm-muted)]">
                  Description
                </h4>
                <MarkdownContent class="mt-2" :source="detail.body" empty-text="No description." />
                <p
                  v-if="detail.additions || detail.deletions"
                  class="mt-2 text-xs text-[var(--oterm-muted)]"
                >
                  +{{ detail.additions }} −{{ detail.deletions }} across
                  {{ detail.changedFiles }} files
                </p>
              </div>

              <div v-if="timelineItems.length" class="mt-6 space-y-4">
                <h4 class="text-xs font-medium uppercase tracking-wide text-[var(--oterm-muted)]">
                  Timeline
                </h4>
                <article
                  v-for="item in timelineItems"
                  :key="item.key"
                  class="rounded border border-[var(--oterm-border)] p-3"
                >
                  <div class="flex flex-wrap items-center gap-2 text-xs text-[var(--oterm-muted)]">
                    <span>{{ item.author }} · {{ item.at }}</span>
                    <span
                      v-if="item.kind === 'review'"
                      class="rounded px-1 text-[10px] uppercase"
                      :class="reviewStateClass(item.state)"
                    >
                      {{ item.state }}
                    </span>
                  </div>
                  <MarkdownContent
                    v-if="item.body.trim()"
                    class="mt-2"
                    :source="item.body"
                    empty-text=""
                  />
                </article>
              </div>

              <div class="mt-6 border-t border-[var(--oterm-border)] pt-4">
                <h4 class="text-xs font-medium uppercase tracking-wide text-[var(--oterm-muted)]">
                  Add a comment
                </h4>
                <textarea
                  v-model="commentBody"
                  rows="4"
                  placeholder="Leave a comment"
                  class="mt-2 w-full rounded border border-[var(--oterm-border)] bg-transparent px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  class="mt-2 rounded bg-[var(--oterm-accent)] px-3 py-1 text-xs text-black disabled:opacity-50"
                  :disabled="commentBusy || !commentBody.trim()"
                  @click="onSubmitComment"
                >
                  Comment
                </button>
              </div>
            </template>
          </div>

          <!-- Commits -->
          <div v-else-if="activeTab === 'commits'" class="p-4">
            <p v-if="commitsLoading" class="text-xs text-[var(--oterm-muted)]">Loading commits…</p>
            <ul v-else-if="commits.length" class="space-y-2">
              <li
                v-for="commit in commits"
                :key="commit.oid"
                class="flex items-start gap-3 rounded border border-[var(--oterm-border)] px-3 py-2"
              >
                <div class="min-w-0 flex-1">
                  <p class="font-medium">{{ commit.messageHeadline }}</p>
                  <p v-if="commit.messageBody" class="mt-1 text-xs text-[var(--oterm-muted)]">
                    {{ commit.messageBody }}
                  </p>
                  <p class="mt-1 text-xs text-[var(--oterm-muted)]">
                    {{ commit.author }} · {{ commit.committedDate }}
                  </p>
                </div>
                <button
                  type="button"
                  class="shrink-0 rounded border border-[var(--oterm-border)] px-2 py-0.5 font-mono text-xs hover:bg-white/5"
                  @click="onOpenCommit(commit.oid)"
                >
                  {{ commit.shortOid }}
                </button>
              </li>
            </ul>
            <p v-else class="text-sm text-[var(--oterm-muted)]">No commits found.</p>
          </div>

          <!-- Checks -->
          <div v-else-if="activeTab === 'checks'" class="p-4">
            <p v-if="checksLoading" class="text-xs text-[var(--oterm-muted)]">Loading checks…</p>
            <ul v-else-if="checks.length" class="space-y-2">
              <li
                v-for="(check, index) in checks"
                :key="`${check.name}-${check.startedAt}-${check.workflow}-${index}`"
                class="flex items-center gap-3 rounded border border-[var(--oterm-border)] px-3 py-2"
              >
                <span
                  class="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase"
                  :class="checkBucketClass(check.bucket)"
                >
                  {{ check.bucket || check.state }}
                </span>
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium">{{ check.name }}</p>
                  <p v-if="check.description" class="truncate text-xs text-[var(--oterm-muted)]">
                    {{ check.description }}
                  </p>
                  <p v-if="check.workflow" class="text-[10px] text-[var(--oterm-muted)]">
                    {{ check.workflow }}
                  </p>
                </div>
                <a
                  v-if="check.link"
                  :href="check.link"
                  class="shrink-0 text-xs text-[var(--oterm-accent)] hover:underline"
                  @click.prevent="openUrl(check.link!)"
                >
                  Details
                </a>
              </li>
            </ul>
            <p v-else class="text-sm text-[var(--oterm-muted)]">No checks reported.</p>
          </div>

          <!-- Files changed -->
          <div v-else-if="activeTab === 'files'" class="flex min-h-0 h-full">
            <aside
              class="w-64 shrink-0 overflow-auto border-r border-[var(--oterm-border)] p-2"
            >
              <p v-if="filesLoading" class="p-2 text-xs text-[var(--oterm-muted)]">Loading files…</p>
              <button
                v-for="file in files"
                :key="file.path"
                type="button"
                class="mb-1 block w-full rounded px-2 py-1.5 text-left text-xs transition hover:bg-white/5"
                :class="selectedFilePath === file.path ? 'bg-white/5' : ''"
                @click="selectedFilePath = file.path"
              >
                <span class="block truncate font-medium">{{ file.path }}</span>
                <span class="mt-0.5 block text-[10px] text-[var(--oterm-muted)]">
                  <span class="text-green-400">+{{ file.additions }}</span>
                  <span class="text-red-400"> −{{ file.deletions }}</span>
                  · {{ changeTypeLabel(file.changeType) }}
                </span>
              </button>
              <p v-if="!filesLoading && files.length === 0" class="p-2 text-xs text-[var(--oterm-muted)]">
                No changed files.
              </p>
            </aside>
            <div class="min-h-0 min-w-0 flex-1">
              <GitDiffViewer
                :content="selectedFilePatch"
                :loading="diffLoading"
                class="h-full"
              />
              <p
                v-if="!diffLoading && selectedFilePath && !selectedFilePatch"
                class="p-4 text-sm text-[var(--oterm-muted)]"
              >
                No diff available for this file.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        v-else-if="!loading && provider?.authOk"
        class="flex flex-1 items-center justify-center text-sm text-[var(--oterm-muted)]"
      >
        Select a pull request
      </section>
    </div>
  </div>
</template>
