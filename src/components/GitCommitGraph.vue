<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import type { GitCommitEntry } from "../types/git";
import type { GraphCommit } from "../types/branchManager";
import {
  buildGraphLayout,
  GRAPH_HEAD_R,
  GRAPH_LANE_WIDTH,
  GRAPH_NODE_R,
  GRAPH_ROW_HEIGHT,
  isHeadCommit,
  parseDecorations,

} from "../lib/gitGraphLayout";
import {
  getCommitGraph,
  listIncomingOutgoing,
  switchDetached,
  revertCommit,
  cherryPickCommit,
  resetCommit,
  createBranch,
  createTag,
  squashCommits,
} from "../lib/branchManagerApi";
import { gitRemoteBrowserUrl } from "../lib/pullRequestApi";
import { openUrl } from "@tauri-apps/plugin-opener";
import { pushAppToast } from "../lib/appToast";
import { formatGitOperationError } from "../lib/formatGitError";
import { writeClipboardText } from "../lib/clipboard";
import CommitContextMenu from "./CommitContextMenu.vue";

const STORAGE_KEY = "oterm:sc-graph-collapsed";
const HEIGHT_STORAGE_KEY = "oterm:sc-graph-height";
const DEFAULT_GRAPH_HEIGHT = 240;
const MIN_GRAPH_HEIGHT = 160;
const MAX_GRAPH_HEIGHT = 560;

const props = defineProps<{
  repoRoot: string;
  ahead: number;
  behind: number;
  selectedHash: string | null;
  refreshToken: number;
}>();

const emit = defineEmits<{
  selectCommit: [hash: string, expand?: boolean];
}>();

const commitContextMenuOpen = ref(false);
const commitContextMenuX = ref(0);
const commitContextMenuY = ref(0);
const commitContextTarget = ref<string | null>(null);
const busy = ref(false);

const collapsed = ref(localStorage.getItem(STORAGE_KEY) === "1");

// ⚡ Bolt Optimization: Use shallowRef for large arrays
// Ref deeply proxies every property which is a massive bottleneck for thousands
// of commit objects. shallowRef only tracks the .value reassignment, significantly
// improving reactivity performance and memory usage.
const commits = shallowRef<GraphCommit[]>([]);
const incoming = shallowRef<GitCommitEntry[]>([]);
const outgoing = shallowRef<GitCommitEntry[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const hasMore = ref(true);
const error = ref<string | null>(null);
const scrollRoot = ref<HTMLElement | null>(null);
const graphExpanded = ref(false);
const graphHeight = ref(readStoredGraphHeight());

const graphSkip = ref(0);

const hoveredRowIndex = ref<number | null>(null);

const hoveredColor = computed(() => {
  if (hoveredRowIndex.value === null) return null;
  return layout.value.rows[hoveredRowIndex.value]?.color ?? null;
});

const PAGE_SIZE = 50;

function appendCommits(existing: GraphCommit[], page: GraphCommit[]): GraphCommit[] {
  const seen = new Set(existing.map((commit) => commit.hash));
  const merged = [...existing];
  for (const commit of page) {
    if (seen.has(commit.hash)) continue;
    seen.add(commit.hash);
    merged.push(commit);
  }
  return merged;
}

function readStoredGraphHeight(): number {
  const stored = Number(localStorage.getItem(HEIGHT_STORAGE_KEY));
  if (!Number.isFinite(stored)) return DEFAULT_GRAPH_HEIGHT;
  return Math.min(MAX_GRAPH_HEIGHT, Math.max(MIN_GRAPH_HEIGHT, stored));
}

function persistGraphHeight() {
  localStorage.setItem(HEIGHT_STORAGE_KEY, String(graphHeight.value));
}

function toggleGraphExpanded(event: MouseEvent) {
  event.stopPropagation();
  graphExpanded.value = !graphExpanded.value;
  graphHeight.value = graphExpanded.value ? MAX_GRAPH_HEIGHT : DEFAULT_GRAPH_HEIGHT;
  persistGraphHeight();
}

function onResizePointerDown(event: PointerEvent) {
  event.preventDefault();
  event.stopPropagation();
  const startY = event.clientY;
  const startHeight = graphHeight.value;
  graphExpanded.value = false;

  const onMove = (moveEvent: PointerEvent) => {
    graphHeight.value = Math.min(
      MAX_GRAPH_HEIGHT,
      Math.max(MIN_GRAPH_HEIGHT, startHeight + (moveEvent.clientY - startY)),
    );
  };

  const onUp = () => {
    persistGraphHeight();
    graphExpanded.value = graphHeight.value >= MAX_GRAPH_HEIGHT - 8;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

const layout = computed(() => buildGraphLayout(commits.value));

// ⚡ Bolt Optimization: Memoize decoration parsing
// Previously, parseDecorations() and filtering ran directly in the v-for template.
// This caused thousands of unnecessary string allocations and regex evaluations
// every time the graph re-rendered (e.g. on row hover).
const parsedCommits = computed(() => {
  return commits.value.map((commit) => {
    const isHead = isHeadCommit(commit.decorations);

    const allBadges = parseDecorations(commit.decorations);
    const headBadge = allBadges.find((part) => part.startsWith("HEAD -> "));
    const primaryLabel = headBadge ? headBadge.replace("HEAD -> ", "").trim() : (allBadges[0] ?? null);

    const badges = allBadges.filter(
      (b) => !b.startsWith("HEAD ->") && b !== primaryLabel
    );
    return {
      isHead,
      primaryLabel,
      badges,
    };
  });
});

watch(collapsed, (value) => {
  localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  if (!value && commits.value.length === 0) {
    void loadGraph(true);
  }
});

watch(
  () => [props.repoRoot, props.refreshToken] as const,
  () => {
    if (!collapsed.value) {
      void loadGraph(true);
    } else {
      commits.value = [];
      incoming.value = [];
      outgoing.value = [];
      hasMore.value = true;
      graphSkip.value = 0;
    }
  },
);

onMounted(() => {
  if (!collapsed.value) {
    void loadGraph(true);
  }
});

async function loadSyncMarkers() {
  incoming.value = [];
  outgoing.value = [];
  if (props.behind > 0) {
    try {
      incoming.value = await listIncomingOutgoing(props.repoRoot, "incoming");
    } catch {
      incoming.value = [];
    }
  }
  if (props.ahead > 0) {
    try {
      outgoing.value = await listIncomingOutgoing(props.repoRoot, "outgoing");
    } catch {
      outgoing.value = [];
    }
  }
}

async function loadGraph(reset: boolean) {
  if (!props.repoRoot) return;
  if (reset) {
    loading.value = true;
    error.value = null;
    hasMore.value = true;
    graphSkip.value = 0;
  } else {
    loadingMore.value = true;
  }

  try {
    const page = await getCommitGraph(props.repoRoot, {
      limit: PAGE_SIZE,
      skip: graphSkip.value,
      scope: "branch",
    });
    if (reset) {
      commits.value = page.commits;
      await loadSyncMarkers();
    } else {
      commits.value = appendCommits(commits.value, page.commits);
    }
    graphSkip.value = page.nextSkip;
    hasMore.value = page.hasMore;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    if (reset) {
      commits.value = [];
    }
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function closeCommitContextMenu() {
  commitContextMenuOpen.value = false;
  commitContextTarget.value = null;
}

function openCommitContextMenu(hash: string, event: MouseEvent) {
  commitContextTarget.value = hash;
  onSelect(hash);
  commitContextMenuX.value = event.clientX;
  commitContextMenuY.value = event.clientY;
  commitContextMenuOpen.value = true;
}

async function onCommitContextCopyHash() {
  const hash = commitContextTarget.value;
  if (!hash) return;
  try {
    await writeClipboardText(hash);
    pushAppToast("Copied commit hash to clipboard", "success");
  } catch (err) {
    pushAppToast("Failed to copy hash", "error");
  } finally {
    closeCommitContextMenu();
  }
}

async function runAction(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  try {
    await action();
    await loadGraph(true);
  } catch (err) {
    const msg = formatGitOperationError(err);
    pushAppToast(msg, "error");
  } finally {
    busy.value = false;
  }
}

function onCommitContextView() {
  const hash = commitContextTarget.value;
  if (!hash) return;
  emit("selectCommit", hash, true);
  closeCommitContextMenu();
}

function onCommitContextSwitch() {
  const hash = commitContextTarget.value;
  if (!hash) return;
  runAction(() => switchDetached(props.repoRoot, hash));
  closeCommitContextMenu();
}

async function onCommitContextOpenInBrowser() {
  const hash = commitContextTarget.value;
  if (!hash) return;
  try {
    const url = await gitRemoteBrowserUrl(props.repoRoot, "commit", hash);
    await openUrl(url);
  } catch (err) {
    pushAppToast("Failed to open browser: " + String(err), "error");
  } finally {
    closeCommitContextMenu();
  }
}

function onCommitContextRevert() {
  const hash = commitContextTarget.value;
  if (!hash) return;
  runAction(() => revertCommit(props.repoRoot, hash));
  closeCommitContextMenu();
}

function onCommitContextCherryPick() {
  const hash = commitContextTarget.value;
  if (!hash) return;
  runAction(() => cherryPickCommit(props.repoRoot, hash));
  closeCommitContextMenu();
}

async function runReset(mode: "mixed" | "hard") {
  const hash = commitContextTarget.value;
  if (!hash) return;
  if (mode === "hard" && !window.confirm("Hard reset will discard all uncommitted changes. Proceed?")) {
    return;
  }
  runAction(() => resetCommit(props.repoRoot, hash, mode));
}

function onCommitContextResetMixed() {
  runReset('mixed');
  closeCommitContextMenu();
}

function onCommitContextResetHard() {
  runReset('hard');
  closeCommitContextMenu();
}

function onCommitContextCreateBranch() {
  const hash = commitContextTarget.value;
  if (!hash) return;
  const name = window.prompt("Enter new branch name:");
  if (!name || !name.trim()) return;
  runAction(async () => {
    await createBranch(props.repoRoot, name.trim(), hash);
    pushAppToast(`Created branch ${name}`, "success");
  });
  closeCommitContextMenu();
}

function onCommitContextCreateTag() {
  const hash = commitContextTarget.value;
  if (!hash) return;
  const name = window.prompt("Enter new tag name:");
  if (!name || !name.trim()) return;
  const message = window.prompt("Enter tag message (optional):");
  runAction(async () => {
    await createTag(props.repoRoot, name.trim(), hash, message?.trim() || undefined);
    pushAppToast(`Created tag ${name}`, "success");
  });
  closeCommitContextMenu();
}

function onCommitContextSquash() {
  const hash = commitContextTarget.value;
  if (!hash) return;
  const countStr = window.prompt("Squash how many commits?", "2");
  if (!countStr) return;
  const count = Number(countStr);
  if (!Number.isFinite(count) || count < 2) return;
  const message = window.prompt("Squash commit message:");
  if (!message || !message.trim()) return;
  runAction(async () => {
    await squashCommits(props.repoRoot, count, message.trim());
    pushAppToast("Squashed commits", "success");
  });
  closeCommitContextMenu();
}

function toggleCollapsed() {
  collapsed.value = !collapsed.value;
}

function onSelect(hash: string) {
  emit("selectCommit", hash, false);
}

function onDblClick(hash: string) {
  emit("selectCommit", hash, true);
}

function onScroll() {
  const el = scrollRoot.value;
  if (!el || loading.value || loadingMore.value || !hasMore.value || collapsed.value) return;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
    void loadGraph(false);
  }
}

function isSelected(hash: string): boolean {
  return props.selectedHash === hash;
}

const syncSections = computed(() => {
  const sections: {
    key: string;
    label: string;
    color: string;
    entries: GitCommitEntry[];
  }[] = [];
  if (props.behind > 0) {
    sections.push({
      key: "incoming",
      label: `Incoming (${props.behind})`,
      color: "text-[#e3b341]",
      entries: incoming.value,
    });
  }
  if (props.ahead > 0) {
    sections.push({
      key: "outgoing",
      label: `Outgoing (${props.ahead})`,
      color: "text-[#58a6ff]",
      entries: outgoing.value,
    });
  }
  return sections;
});
</script>

<template>
  <section class="border-b border-[var(--oterm-border)] py-2">
    <div class="flex w-full items-center gap-1 px-3 pb-1.5">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-1 text-left"
        :aria-expanded="!collapsed"
        @click="toggleCollapsed"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="currentColor"
          class="shrink-0 text-[var(--oterm-faint)] transition"
          :class="collapsed ? '-rotate-90' : ''"
        >
          <path d="M3 1.5 7.5 5 3 8.5z" />
        </svg>
        <p
          class="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--oterm-faint)]"
          style="font-family: var(--oterm-font-ui)"
        >
          Graph
        </p>
      </button>
      <div v-if="!collapsed" class="ml-auto flex shrink-0 items-center gap-1">
        <span
          v-if="loading"
          class="text-[10px] text-[var(--oterm-muted)]"
          style="font-family: var(--oterm-font-ui)"
        >
          Loading…
        </span>
        <button
          type="button"
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--oterm-muted)] transition hover:bg-white/5 hover:text-[var(--oterm-text)]"
          :title="graphExpanded ? 'Reset graph height' : 'Expand graph'"
          :aria-label="graphExpanded ? 'Reset graph height' : 'Expand graph'"
          @click="toggleGraphExpanded"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              v-if="graphExpanded"
              d="M5 2H2v3M11 2h3v3M5 14H2v-3M11 14h3v-3"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              v-else
              d="M3 3h4M3 3v4M13 3H9M13 3v4M3 13h4M3 13V9M13 13H9M13 13V9"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>

    <div v-if="!collapsed">
      <p v-if="error" class="px-3 pb-2 text-xs text-[var(--oterm-danger)]">{{ error }}</p>

      <div
        ref="scrollRoot"
        class="overflow-y-auto oterm-scroll"
        :style="{ height: `${graphHeight}px` }"
        @scroll.passive="onScroll"
      >
        <div
          v-for="section in syncSections"
          :key="section.key"
          class="border-b border-[var(--oterm-border)]/60 px-3 py-2"
        >
          <p
            class="text-[10px] font-semibold uppercase tracking-[0.08em]"
            :class="section.color"
            style="font-family: var(--oterm-font-ui)"
          >
            {{ section.label }}
          </p>
          <button
            v-for="entry in section.entries"
            :key="`${section.key}:${entry.hash}`"
            type="button"
            class="mt-1.5 block w-full rounded px-1 py-1.5 text-left hover:bg-white/[0.03]"
            :class="isSelected(entry.hash) ? 'bg-white/[0.05]' : ''"
            @click="onSelect(entry.hash)"
            @dblclick="onDblClick(entry.hash)"
            @contextmenu.prevent="openCommitContextMenu(entry.hash, $event)"
          >
            <p class="truncate text-xs leading-snug text-[var(--oterm-text)]">{{ entry.subject }}</p>
            <p class="mt-0.5 truncate text-[10px] leading-snug text-[var(--oterm-faint)]">{{ entry.shortHash }}</p>
          </button>
        </div>

        <div
          v-if="commits.length"
          class="relative pl-3"
          :style="{ minHeight: `${layout.totalHeight}px` }"
        >
          <svg
            class="graph-lines pointer-events-none absolute left-3 top-0 overflow-visible"
            :viewBox="`0 0 ${layout.totalWidth} ${layout.totalHeight}`"
            :width="layout.totalWidth"
            :height="layout.totalHeight"
            shape-rendering="geometricPrecision"
            aria-hidden="true"
          >
            <!-- Background paths -->
            <template v-for="row in layout.rows" :key="`paths:${row.hash}`">
              <path
                v-for="(path, pathIndex) in row.paths"
                :key="`${row.hash}:${pathIndex}`"
                v-memo="[path, hoveredColor === null, hoveredColor === path.color]"
                :d="path.d"
                fill="none"
                :stroke="path.color"
                :stroke-width="hoveredColor === path.color ? 3.5 : 2"
                :opacity="hoveredColor === null || hoveredColor === path.color ? 1 : 0.2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="transition-all duration-150 ease-in-out"
              />
            </template>

            <!-- Interactive overlay nodes -->
            <!-- ⚡ Bolt Optimization: Use v-memo to prevent re-rendering all nodes on hover -->
            <g
              v-for="(row, index) in layout.rows"
              :key="`node:${row.hash}`"
              v-memo="[row, parsedCommits[index], isSelected(row.hash), hoveredRowIndex === null, hoveredRowIndex === index, hoveredColor === null, hoveredColor === row.color]"
              :opacity="hoveredRowIndex === null || hoveredRowIndex === index || hoveredColor === row.color ? 1 : 0.2"
              class="transition-all duration-150 ease-in-out"
            >
              <!-- HEAD commit nodes -->
              <template v-if="parsedCommits[index]?.isHead">
                <!-- Hover halo ring -->
                <circle
                  v-if="hoveredRowIndex === index"
                  :cx="row.nodeX"
                  :cy="row.nodeY"
                  :r="GRAPH_HEAD_R + 3"
                  :fill="row.color"
                  opacity="0.15"
                />
                <!-- Outer circle -->
                <circle
                  :cx="row.nodeX"
                  :cy="row.nodeY"
                  :r="GRAPH_HEAD_R"
                  fill="var(--oterm-bg)"
                  :stroke="row.color ?? '#3794ff'"
                  stroke-width="2.5"
                />
                <!-- Center dot -->
                <circle
                  :cx="row.nodeX"
                  :cy="row.nodeY"
                  r="2"
                  :fill="row.color ?? '#3794ff'"
                />
              </template>

              <!-- Regular commit nodes -->
              <template v-else>
                <!-- Hover halo ring -->
                <circle
                  v-if="hoveredRowIndex === index"
                  :cx="row.nodeX"
                  :cy="row.nodeY"
                  :r="GRAPH_NODE_R + 3"
                  :fill="row.color"
                  opacity="0.15"
                />
                <circle
                  :cx="row.nodeX"
                  :cy="row.nodeY"
                  :r="hoveredRowIndex === index ? GRAPH_NODE_R + 1 : GRAPH_NODE_R"
                  :fill="row.color ?? '#3794ff'"
                  class="transition-all duration-150 ease-in-out"
                />
              </template>
            </g>
          </svg>

          <button
            v-for="(commit, index) in commits"
            :key="commit.hash"
            type="button"
            class="relative flex w-full items-stretch gap-2 pr-3 text-left hover:bg-white/[0.03]"
            :class="isSelected(commit.hash) ? 'bg-white/[0.05]' : ''"
            :style="{ minHeight: `${GRAPH_ROW_HEIGHT}px` }"
            @click="onSelect(commit.hash)"
            @dblclick="onDblClick(commit.hash)"
            @contextmenu.prevent="openCommitContextMenu(commit.hash, $event)"
            @mouseenter="hoveredRowIndex = index"
            @mouseleave="hoveredRowIndex = null"
          >
            <div
              class="shrink-0"
              :style="{
                width: `${Math.max(layout.rows[index]?.laneCount ?? 1, 1) * GRAPH_LANE_WIDTH}px`,
                height: `${GRAPH_ROW_HEIGHT}px`,
              }"
            >
            </div>
            <div class="min-w-0 flex-1 py-0.5">
              <p
                class="truncate text-xs leading-snug text-[var(--oterm-text)]"
                style="font-family: var(--oterm-font-ui)"
              >
                {{ commit.subject }}
                <span
                  v-if="parsedCommits[index]?.primaryLabel"
                  class="ml-1.5 inline-flex items-center rounded px-1.5 py-px text-[10px] font-medium leading-none text-white"
                  :style="{ backgroundColor: layout.rows[index]?.color ?? '#3794ff' }"
                >
                  {{ parsedCommits[index]?.primaryLabel }}
                </span>
              </p>
              <p
                class="mt-0.5 truncate text-[10px] leading-snug text-[var(--oterm-faint)]"
                style="font-family: var(--oterm-font-mono)"
              >
                {{ commit.shortHash }}
                <span
                  v-for="badge in parsedCommits[index]?.badges"
                  :key="`${commit.hash}:${badge}`"
                  class="ml-1 text-[var(--oterm-muted)]"
                >
                  {{ badge }}
                </span>
              </p>
            </div>
          </button>
        </div>

        <p
          v-else-if="!loading && !error"
          class="px-3 py-2 text-xs text-[var(--oterm-faint)]"
          style="font-family: var(--oterm-font-ui)"
        >
          No commits
        </p>

        <p
          v-if="loadingMore"
          class="px-3 py-2 text-[10px] text-[var(--oterm-muted)]"
          style="font-family: var(--oterm-font-ui)"
        >
          Loading more…
        </p>
      </div>

      <div
        class="group flex h-2 cursor-row-resize items-center justify-center border-t border-[var(--oterm-border)]/60 hover:bg-white/[0.03]"
        title="Drag to resize graph"
        @pointerdown="onResizePointerDown"
      >
        <span
          class="h-0.5 w-8 rounded-full bg-[var(--oterm-border)] transition group-hover:bg-[var(--oterm-muted)]"
          aria-hidden="true"
        />
      </div>
    </div>

    <CommitContextMenu
      :open="commitContextMenuOpen"
      :x="commitContextMenuX"
      :y="commitContextMenuY"
      :hash="commitContextTarget"
      :busy="busy"
      @close="closeCommitContextMenu"
      @copy-hash="onCommitContextCopyHash"
      @view="onCommitContextView"
      @switch="onCommitContextSwitch"
      @open-in-browser="onCommitContextOpenInBrowser"
      @revert="onCommitContextRevert"
      @cherry-pick="onCommitContextCherryPick"
      @reset-mixed="onCommitContextResetMixed"
      @reset-hard="onCommitContextResetHard"
      @create-branch="onCommitContextCreateBranch"
      @create-tag="onCommitContextCreateTag"
      @squash="onCommitContextSquash"
    />
  </section>
</template>

<style scoped>
.graph-lines {
  shape-rendering: geometricPrecision;
  transform: translateZ(0);
}
</style>
