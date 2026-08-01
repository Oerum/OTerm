<script setup lang="ts">
import { openUrl } from "@tauri-apps/plugin-opener";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  createBranchFromIssue,
  listIssues,
  viewIssue,
} from "../lib/issueApi";
import { detectPrProvider } from "../lib/pullRequestApi";
import { writeClipboardText } from "../lib/clipboard";
import { pushAppToast } from "../lib/appToast";
import type { IssueDetail, IssueListFilters, IssueSummary } from "../types/issue";
import type { PrProviderInfo } from "../types/pullRequest";
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
const issues = ref<IssueSummary[]>([]);
const detail = ref<IssueDetail | null>(null);
const loading = ref(false);
const detailLoading = ref(false);
const error = ref<string | null>(null);
const includeClosed = ref(false);
const assignedToMe = ref(false);
const filterLabel = ref("");
const filterAuthor = ref("");
const filterAssignee = ref("");
const search = ref("");
const selectedNumber = ref<number | null>(null);
const busy = ref(false);
const rootRef = ref<HTMLElement | null>(null);

let filterTimer: ReturnType<typeof setTimeout> | null = null;

const listFilters = computed<IssueListFilters>(() => ({
  state: includeClosed.value ? "all" : "open",
  label: filterLabel.value.trim() || null,
  author: filterAuthor.value.trim() || null,
  assignee: assignedToMe.value ? "@me" : (filterAssignee.value.trim() || null),
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
    const res = await viewIssue(props.repoRoot, number);
    if (selectedNumber.value === number) {
      detail.value = res;
    }
  } catch (err) {
    if (selectedNumber.value === number) {
      detail.value = null;
      error.value = err instanceof Error ? err.message : String(err);
    }
  } finally {
    if (selectedNumber.value === number) {
      detailLoading.value = false;
    }
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
  await writeClipboardText(issue.url);
  pushAppToast("Issue URL copied", "success");
}

async function onCreateBranch(issue: IssueSummary) {
  busy.value = true;
  error.value = null;
  try {
    await createBranchFromIssue(props.repoRoot, issue.number);
    emit("refreshGit");
    pushAppToast(`Branch created for #${issue.number}`, "success");
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

function onKeyDown(event: KeyboardEvent) {
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
    return;
  }
  if (!rootRef.value?.contains(active) && active !== document.body) {
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
});

watch(() => props.repoRoot, () => {
  issues.value = [];
  detail.value = null;
  selectedNumber.value = null;
  void loadIssues();
});
watch([includeClosed, assignedToMe], () => void loadIssues());
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
watch(() => props.active, (isActive) => {
  if (isActive) {
    void loadIssues();
  }
});
</script>

<template>
  <div
    ref="rootRef"
    tabindex="0"
    class="flex min-h-0 flex-1 flex-col bg-[var(--oterm-bg)] text-[var(--oterm-text)] outline-none"
  >
    <RepoPanelHeader :repo-root="repoRoot" header-class="px-4 py-2">
      <template #icon>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" class="shrink-0 text-[var(--oterm-accent)]">
          <circle cx="8" cy="8" r="6" stroke-width="1.5" />
          <path d="M8 11.5h.01M8 5v4" stroke-width="2" stroke-linecap="round" />
        </svg>
      </template>
      <template #title>
        <h2 class="text-sm font-semibold tracking-wide">Issues</h2>
      </template>
      <label class="flex cursor-pointer select-none items-center gap-2 text-xs text-[var(--oterm-muted)]">
        <input v-model="assignedToMe" type="checkbox" class="cursor-pointer rounded border-[var(--oterm-border)] bg-transparent accent-[var(--oterm-accent)]" />
        Assigned to me
      </label>

      <label class="flex cursor-pointer select-none items-center gap-2 text-xs text-[var(--oterm-muted)]">
        <input v-model="includeClosed" type="checkbox" class="cursor-pointer rounded border-[var(--oterm-border)] bg-transparent accent-[var(--oterm-accent)]" />
        Show closed
      </label>

      <div class="h-4 w-[1px] bg-[var(--oterm-border)]" />

      <button type="button" class="pr-header-btn" :disabled="loading" @click="loadIssues">
        Refresh
      </button>
      <button type="button" class="pr-header-btn" @click="emit('close')">
        Close
      </button>
    </RepoPanelHeader>

    <div
      class="flex flex-wrap shrink-0 items-center gap-2 border-b border-[var(--oterm-border)] px-4 py-2 bg-[var(--oterm-panel)]/35"
    >
      <div class="relative flex-1 min-w-[200px]">
        <span class="absolute inset-y-0 left-0 flex items-center pl-2.5 text-[var(--oterm-faint)]">
          <UiGlyph name="list-search" :size="12" />
        </span>
        <input
          v-model="search"
          type="search"
          placeholder="Filter list by title, labels, assignees…"
          class="w-full rounded border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/40 py-1 pl-7.5 pr-2.5 text-xs text-[var(--oterm-text)] placeholder-[var(--oterm-faint)] outline-none focus:border-[var(--oterm-accent)]/30 transition duration-150"
        />
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <input
          v-model="filterLabel"
          type="text"
          placeholder="Label"
          aria-label="Filter by label"
          class="w-24 rounded border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/40 px-2 py-1 text-xs text-[var(--oterm-text)] placeholder-[var(--oterm-faint)] outline-none focus:border-[var(--oterm-accent)]/30 transition"
        />
        <input
          v-model="filterAuthor"
          type="text"
          placeholder="Author"
          aria-label="Filter by author"
          class="w-24 rounded border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/40 px-2 py-1 text-xs text-[var(--oterm-text)] placeholder-[var(--oterm-faint)] outline-none focus:border-[var(--oterm-accent)]/30 transition"
        />
        <input
          v-model="filterAssignee"
          type="text"
          placeholder="Assignee"
          aria-label="Filter by assignee"
          :disabled="assignedToMe"
          class="w-24 rounded border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/40 px-2 py-1 text-xs text-[var(--oterm-text)] placeholder-[var(--oterm-faint)] outline-none focus:border-[var(--oterm-accent)]/30 transition disabled:opacity-40"
        />
      </div>
    </div>

    <p v-if="provider && !provider.authOk" class="px-4 py-3 text-sm text-[var(--oterm-muted)]">
      {{ provider.message ?? "Issues are unavailable for this repository." }}
    </p>

    <p v-if="error" class="px-4 py-2 text-sm text-[var(--oterm-danger)]">{{ error }}</p>

    <div class="flex min-h-0 flex-1">
      <aside class="w-80 shrink-0 overflow-auto border-r border-[var(--oterm-border)] flex flex-col justify-between">
        <div class="overflow-y-auto flex-1 oterm-scroll">
          <p v-if="loading" class="p-4 text-xs text-[var(--oterm-muted)]">Loading…</p>
          <button
            v-for="issue in filteredIssues"
            :key="issue.number"
            type="button"
            class="block w-full border-b border-[var(--oterm-border)] px-3 py-2 text-left text-sm transition hover:bg-white/5"
            :class="selectedNumber === issue.number ? 'bg-white/5 border-l-2 border-l-[var(--oterm-accent)] pl-[10px]' : 'border-l-2 border-l-transparent'"
            @click="selectIssue(issue.number)"
          >
            <div class="flex items-center gap-2">
              <span class="text-[var(--oterm-muted)]">#{{ issue.number }}</span>
              <span
                class="rounded px-1 text-[10px] uppercase"
                :class="
                  issue.state === 'OPEN'
                    ? 'bg-green-500/20 text-green-300'
                    : 'bg-white/10 text-[var(--oterm-muted)]'
                "
              >
                {{ issue.state }}
              </span>
            </div>
            <div class="mt-1 truncate font-medium">{{ issue.title }}</div>
            <div class="mt-0.5 truncate text-xs text-[var(--oterm-muted)]">
              {{ issue.author }}
              <span v-if="issue.assignees.length"> · {{ issue.assignees.join(", ") }}</span>
            </div>
            <div v-if="issue.labels.length" class="mt-1 flex flex-wrap gap-1">
              <span
                v-for="label in issue.labels"
                :key="label"
                class="rounded bg-white/10 px-1 text-[10px] text-[var(--oterm-muted)]"
              >
                {{ label }}
              </span>
            </div>
          </button>
          <p
            v-if="!loading && filteredIssues.length === 0 && provider?.authOk"
            class="p-4 text-xs text-[var(--oterm-muted)]"
          >
            No issues found.
          </p>
        </div>
        <div v-if="filteredIssues.length > 0" class="shrink-0 border-t border-[var(--oterm-border)] px-3 py-1.5 bg-[var(--oterm-panel)]/40 flex items-center justify-between text-[10px] text-[var(--oterm-faint)] select-none">
          <span>Use <kbd class="px-1 py-0.5 bg-white/5 border border-white/10 rounded">↑</kbd> <kbd class="px-1 py-0.5 bg-white/5 border border-white/10 rounded">↓</kbd> keys to navigate</span>
          <span>{{ filteredIssues.length }} issues</span>
        </div>
      </aside>

      <section v-if="selected" class="min-w-0 flex-1 overflow-auto p-4">
        <h3 class="text-lg font-medium">{{ selected.title }}</h3>
        <p class="mt-1 text-sm text-[var(--oterm-muted)]">
          #{{ selected.number }} · {{ selected.author }}
          <span v-if="selected.assignees.length"> · {{ selected.assignees.join(", ") }}</span>
        </p>
        <div v-if="selected.labels.length" class="mt-2 flex flex-wrap gap-1">
          <span
            v-for="label in selected.labels"
            :key="label"
            class="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-[var(--oterm-muted)]"
          >
            {{ label }}
          </span>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
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
            @click="onCopyUrl(selected)"
          >
            Copy URL
          </button>
          <button
            type="button"
            class="rounded border border-[var(--oterm-border)] px-3 py-1 text-xs hover:bg-white/5"
            :disabled="busy"
            @click="onCreateBranch(selected)"
          >
            Create branch
          </button>
        </div>

        <p v-if="detailLoading" class="mt-6 text-xs text-[var(--oterm-muted)]">Loading details…</p>
        <template v-else-if="detail">
          <div class="mt-6">
            <h4 class="text-xs font-medium uppercase tracking-wide text-[var(--oterm-muted)]">
              Description
            </h4>
            <MarkdownContent class="mt-2" :source="detail.body" empty-text="No description." />
          </div>
          <div v-if="detail.comments.length" class="mt-6 space-y-4">
            <h4 class="text-xs font-medium uppercase tracking-wide text-[var(--oterm-muted)]">
              Comments
            </h4>
            <article
              v-for="(comment, index) in detail.comments"
              :key="`${comment.author}-${comment.createdAt}-${index}`"
              class="rounded border border-[var(--oterm-border)] p-3"
            >
              <p class="text-xs text-[var(--oterm-muted)]">
                {{ comment.author }} · {{ comment.createdAt }}
              </p>
              <MarkdownContent class="mt-2" :source="comment.body" />
            </article>
          </div>
        </template>
      </section>
      <section
        v-else-if="!loading && provider?.authOk"
        class="flex flex-1 items-center justify-center text-sm text-[var(--oterm-muted)]"
      >
        Select an issue
      </section>
    </div>

  </div>
</template>
