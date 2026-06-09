<script setup lang="ts">
import { openUrl } from "@tauri-apps/plugin-opener";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  createBranchFromIssue,
  listIssues,
  viewIssue,
} from "../lib/issueApi";
import { detectPrProvider } from "../lib/pullRequestApi";
import type { IssueDetail, IssueListFilters, IssueSummary } from "../types/issue";
import type { PrProviderInfo } from "../types/pullRequest";
import MarkdownContent from "./MarkdownContent.vue";

const props = defineProps<{
  repoRoot: string;
}>();

const emit = defineEmits<{
  refreshGit: [];
  close: [];
}>();

const provider = ref<PrProviderInfo | null>(null);
const issues = ref<IssueSummary[]>([]);
const detail = ref<IssueDetail | null>(null);
const loading = ref(false);
const detailLoading = ref(false);
const error = ref<string | null>(null);
const includeClosed = ref(false);
const filterLabel = ref("");
const filterAuthor = ref("");
const filterAssignee = ref("");
const search = ref("");
const selectedNumber = ref<number | null>(null);
const busy = ref(false);
const toastMessage = ref<string | null>(null);
const rootRef = ref<HTMLElement | null>(null);

let filterTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

const listFilters = computed<IssueListFilters>(() => ({
  state: includeClosed.value ? "all" : "open",
  label: filterLabel.value.trim() || null,
  author: filterAuthor.value.trim() || null,
  assignee: filterAssignee.value.trim() || null,
}));

const filteredIssues = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return issues.value;
  return issues.value.filter((issue) => {
    const haystack = [
      issue.number.toString(),
      issue.title,
      issue.author,
      ...issue.labels,
      ...issue.assignees,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
});

const selected = computed(
  () => issues.value.find((issue) => issue.number === selectedNumber.value) ?? null,
);

function showToast(message: string) {
  toastMessage.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.value = null;
  }, 1800);
}

async function loadIssues() {
  loading.value = true;
  error.value = null;
  try {
    provider.value = await detectPrProvider(props.repoRoot);
    if (!provider.value.authOk) {
      issues.value = [];
      detail.value = null;
      return;
    }
    issues.value = await listIssues(props.repoRoot, listFilters.value);
    if (
      selectedNumber.value &&
      !issues.value.some((issue) => issue.number === selectedNumber.value)
    ) {
      selectedNumber.value = filteredIssues.value[0]?.number ?? null;
    } else if (!selectedNumber.value && issues.value.length > 0) {
      selectedNumber.value = issues.value[0].number;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function loadDetail(number: number) {
  detailLoading.value = true;
  error.value = null;
  try {
    detail.value = await viewIssue(props.repoRoot, number);
  } catch (err) {
    detail.value = null;
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    detailLoading.value = false;
  }
}

function scheduleFilterReload() {
  if (filterTimer) clearTimeout(filterTimer);
  filterTimer = setTimeout(() => void loadIssues(), 300);
}

function selectIssue(number: number) {
  selectedNumber.value = number;
}

function moveSelection(delta: number) {
  const rows = filteredIssues.value;
  if (rows.length === 0) return;
  const currentIndex = rows.findIndex((issue) => issue.number === selectedNumber.value);
  const nextIndex =
    currentIndex === -1
      ? delta > 0
        ? 0
        : rows.length - 1
      : Math.min(Math.max(currentIndex + delta, 0), rows.length - 1);
  selectedNumber.value = rows[nextIndex]?.number ?? null;
}

async function onOpen(issue: IssueSummary) {
  await openUrl(issue.url);
}

async function onCopyUrl(issue: IssueSummary) {
  await navigator.clipboard.writeText(issue.url);
  showToast("Issue URL copied");
}

async function onCreateBranch(issue: IssueSummary) {
  busy.value = true;
  error.value = null;
  try {
    await createBranchFromIssue(props.repoRoot, issue.number);
    emit("refreshGit");
    showToast(`Branch created for #${issue.number}`);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

function onKeyDown(event: KeyboardEvent) {
  if (!rootRef.value?.contains(document.activeElement) && document.activeElement !== document.body) {
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSelection(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSelection(-1);
  }
}

onMounted(() => {
  void loadIssues();
  window.addEventListener("keydown", onKeyDown);
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
  if (filterTimer) clearTimeout(filterTimer);
  if (toastTimer) clearTimeout(toastTimer);
});

watch(() => props.repoRoot, () => void loadIssues());
watch(includeClosed, () => void loadIssues());
watch([filterLabel, filterAuthor, filterAssignee], scheduleFilterReload);
watch(selectedNumber, (number) => {
  if (number) void loadDetail(number);
  else detail.value = null;
});
watch(filteredIssues, (rows) => {
  if (selectedNumber.value && !rows.some((issue) => issue.number === selectedNumber.value)) {
    selectedNumber.value = rows[0]?.number ?? null;
  }
});
</script>

<template>
  <div
    ref="rootRef"
    tabindex="0"
    class="flex min-h-0 flex-1 flex-col bg-[var(--warp-bg)] text-[var(--warp-text)] outline-none"
  >
    <header
      class="flex shrink-0 items-center gap-2 border-b border-[var(--warp-border)] px-4 py-2"
    >
      <h2 class="text-sm font-medium">Issues</h2>
      <span class="truncate text-xs text-[var(--warp-muted)]">{{ repoRoot }}</span>
      <div class="flex-1" />
      <label class="flex items-center gap-1.5 text-xs text-[var(--warp-muted)]">
        <input v-model="includeClosed" type="checkbox" class="accent-[var(--warp-accent)]" />
        Show closed
      </label>
      <button
        type="button"
        class="rounded-md border border-[var(--warp-border)] px-2 py-1 text-xs hover:bg-white/5"
        :disabled="loading"
        @click="loadIssues"
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

    <div
      class="grid shrink-0 gap-2 border-b border-[var(--warp-border)] px-4 py-2 sm:grid-cols-2 lg:grid-cols-4"
    >
      <input
        v-model="search"
        type="search"
        placeholder="Filter list…"
        class="rounded border border-[var(--warp-border)] bg-transparent px-2 py-1 text-xs"
      />
      <input
        v-model="filterLabel"
        type="text"
        placeholder="Label"
        class="rounded border border-[var(--warp-border)] bg-transparent px-2 py-1 text-xs"
      />
      <input
        v-model="filterAuthor"
        type="text"
        placeholder="Author"
        class="rounded border border-[var(--warp-border)] bg-transparent px-2 py-1 text-xs"
      />
      <input
        v-model="filterAssignee"
        type="text"
        placeholder="Assignee"
        class="rounded border border-[var(--warp-border)] bg-transparent px-2 py-1 text-xs"
      />
    </div>

    <p v-if="provider && !provider.authOk" class="px-4 py-3 text-sm text-[var(--warp-muted)]">
      {{ provider.message ?? "Issues are unavailable for this repository." }}
    </p>

    <p v-if="error" class="px-4 py-2 text-sm text-[var(--warp-danger)]">{{ error }}</p>

    <div class="flex min-h-0 flex-1">
      <aside class="w-80 shrink-0 overflow-auto border-r border-[var(--warp-border)]">
        <p v-if="loading" class="p-4 text-xs text-[var(--warp-muted)]">Loading…</p>
        <button
          v-for="issue in filteredIssues"
          :key="issue.number"
          type="button"
          class="block w-full border-b border-[var(--warp-border)] px-3 py-2 text-left text-sm transition hover:bg-white/5"
          :class="selectedNumber === issue.number ? 'bg-white/5' : ''"
          @click="selectIssue(issue.number)"
        >
          <div class="flex items-center gap-2">
            <span class="text-[var(--warp-muted)]">#{{ issue.number }}</span>
            <span
              class="rounded px-1 text-[10px] uppercase"
              :class="
                issue.state === 'OPEN'
                  ? 'bg-green-500/20 text-green-300'
                  : 'bg-white/10 text-[var(--warp-muted)]'
              "
            >
              {{ issue.state }}
            </span>
          </div>
          <div class="mt-1 truncate font-medium">{{ issue.title }}</div>
          <div class="mt-0.5 truncate text-xs text-[var(--warp-muted)]">
            {{ issue.author }}
            <span v-if="issue.assignees.length"> · {{ issue.assignees.join(", ") }}</span>
          </div>
          <div v-if="issue.labels.length" class="mt-1 flex flex-wrap gap-1">
            <span
              v-for="label in issue.labels"
              :key="label"
              class="rounded bg-white/10 px-1 text-[10px] text-[var(--warp-muted)]"
            >
              {{ label }}
            </span>
          </div>
        </button>
        <p
          v-if="!loading && filteredIssues.length === 0 && provider?.authOk"
          class="p-4 text-xs text-[var(--warp-muted)]"
        >
          No issues found.
        </p>
      </aside>

      <section v-if="selected" class="min-w-0 flex-1 overflow-auto p-4">
        <h3 class="text-lg font-medium">{{ selected.title }}</h3>
        <p class="mt-1 text-sm text-[var(--warp-muted)]">
          #{{ selected.number }} · {{ selected.author }}
          <span v-if="selected.assignees.length"> · {{ selected.assignees.join(", ") }}</span>
        </p>
        <div v-if="selected.labels.length" class="mt-2 flex flex-wrap gap-1">
          <span
            v-for="label in selected.labels"
            :key="label"
            class="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-[var(--warp-muted)]"
          >
            {{ label }}
          </span>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded border border-[var(--warp-border)] px-3 py-1 text-xs hover:bg-white/5"
            @click="onOpen(selected)"
          >
            Open in browser
          </button>
          <button
            type="button"
            class="rounded border border-[var(--warp-border)] px-3 py-1 text-xs hover:bg-white/5"
            @click="onCopyUrl(selected)"
          >
            Copy URL
          </button>
          <button
            type="button"
            class="rounded border border-[var(--warp-border)] px-3 py-1 text-xs hover:bg-white/5"
            :disabled="busy"
            @click="onCreateBranch(selected)"
          >
            Create branch
          </button>
        </div>

        <p v-if="detailLoading" class="mt-6 text-xs text-[var(--warp-muted)]">Loading details…</p>
        <template v-else-if="detail">
          <div class="mt-6">
            <h4 class="text-xs font-medium uppercase tracking-wide text-[var(--warp-muted)]">
              Description
            </h4>
            <MarkdownContent class="mt-2" :source="detail.body" empty-text="No description." />
          </div>
          <div v-if="detail.comments.length" class="mt-6 space-y-4">
            <h4 class="text-xs font-medium uppercase tracking-wide text-[var(--warp-muted)]">
              Comments
            </h4>
            <article
              v-for="(comment, index) in detail.comments"
              :key="`${comment.author}-${comment.createdAt}-${index}`"
              class="rounded border border-[var(--warp-border)] p-3"
            >
              <p class="text-xs text-[var(--warp-muted)]">
                {{ comment.author }} · {{ comment.createdAt }}
              </p>
              <MarkdownContent class="mt-2" :source="comment.body" />
            </article>
          </div>
        </template>
      </section>
      <section
        v-else-if="!loading && provider?.authOk"
        class="flex flex-1 items-center justify-center text-sm text-[var(--warp-muted)]"
      >
        Select an issue
      </section>
    </div>

    <p
      v-if="toastMessage"
      class="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-[var(--warp-elevated)] px-3 py-1.5 text-xs text-[var(--warp-text)] shadow-lg"
    >
      {{ toastMessage }}
    </p>
  </div>
</template>
