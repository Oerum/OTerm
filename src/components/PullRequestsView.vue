<script setup lang="ts">
import { openUrl } from "@tauri-apps/plugin-opener";
import { computed, onMounted, ref, watch } from "vue";
import {
  checkoutPullRequest,
  createPullRequest,
  detectPrProvider,
  listPullRequests,
} from "../lib/pullRequestApi";
import type { PrProviderInfo, PullRequestSummary } from "../types/pullRequest";

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
const includeClosed = ref(false);
const selectedNumber = ref<number | null>(null);
const showCreate = ref(false);
const createTitle = ref("");
const createBody = ref("");
const createDraft = ref(false);
const busy = ref(false);

const selected = computed(() =>
  pullRequests.value.find((pr) => pr.number === selectedNumber.value) ?? null,
);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    provider.value = await detectPrProvider(props.repoRoot);
    if (!provider.value.authOk) {
      pullRequests.value = [];
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

onMounted(() => void load());
watch(() => props.repoRoot, () => void load());
watch(includeClosed, () => void load());
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-[var(--warp-bg)] text-[var(--warp-text)]">
    <header
      class="flex shrink-0 items-center gap-2 border-b border-[var(--warp-border)] px-4 py-2"
    >
      <h2 class="text-sm font-medium">Pull Requests</h2>
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
        @click="load"
      >
        Refresh
      </button>
      <button
        type="button"
        class="rounded-md bg-[var(--warp-accent)] px-2 py-1 text-xs text-black disabled:opacity-50"
        :disabled="!provider?.authOk || busy"
        @click="showCreate = true"
      >
        New PR
      </button>
      <button
        type="button"
        class="rounded-md border border-[var(--warp-border)] px-2 py-1 text-xs hover:bg-white/5"
        @click="emit('close')"
      >
        Close tab
      </button>
    </header>

    <p v-if="provider && !provider.authOk" class="px-4 py-3 text-sm text-[var(--warp-muted)]">
      {{ provider.message ?? "Pull requests are unavailable for this repository." }}
    </p>

    <p v-if="error" class="px-4 py-2 text-sm text-[var(--warp-danger)]">{{ error }}</p>

    <div v-if="showCreate" class="border-b border-[var(--warp-border)] px-4 py-3">
      <input
        v-model="createTitle"
        type="text"
        placeholder="PR title"
        class="mb-2 w-full rounded border border-[var(--warp-border)] bg-transparent px-2 py-1 text-sm"
      />
      <textarea
        v-model="createBody"
        rows="4"
        placeholder="Description"
        class="mb-2 w-full rounded border border-[var(--warp-border)] bg-transparent px-2 py-1 text-sm"
      />
      <label class="mb-2 flex items-center gap-2 text-xs text-[var(--warp-muted)]">
        <input v-model="createDraft" type="checkbox" class="accent-[var(--warp-accent)]" />
        Create as draft
      </label>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded bg-[var(--warp-accent)] px-3 py-1 text-xs text-black"
          :disabled="busy"
          @click="onCreate"
        >
          Create
        </button>
        <button
          type="button"
          class="rounded border border-[var(--warp-border)] px-3 py-1 text-xs"
          @click="showCreate = false"
        >
          Cancel
        </button>
      </div>
    </div>

    <div class="flex min-h-0 flex-1">
      <aside class="w-80 shrink-0 overflow-auto border-r border-[var(--warp-border)]">
        <p v-if="loading" class="p-4 text-xs text-[var(--warp-muted)]">Loading…</p>
        <button
          v-for="pr in pullRequests"
          :key="pr.number"
          type="button"
          class="block w-full border-b border-[var(--warp-border)] px-3 py-2 text-left text-sm transition hover:bg-white/5"
          :class="selectedNumber === pr.number ? 'bg-white/5' : ''"
          @click="selectedNumber = pr.number"
        >
          <div class="flex items-center gap-2">
            <span class="text-[var(--warp-muted)]">#{{ pr.number }}</span>
            <span
              class="rounded px-1 text-[10px] uppercase"
              :class="
                pr.state === 'OPEN'
                  ? 'bg-green-500/20 text-green-300'
                  : 'bg-white/10 text-[var(--warp-muted)]'
              "
            >
              {{ pr.state }}
            </span>
            <span v-if="pr.isDraft" class="text-[10px] text-[var(--warp-muted)]">draft</span>
          </div>
          <div class="mt-1 truncate font-medium">{{ pr.title }}</div>
          <div class="mt-0.5 truncate text-xs text-[var(--warp-muted)]">
            {{ pr.headRef }} → {{ pr.baseRef }}
          </div>
        </button>
        <p
          v-if="!loading && pullRequests.length === 0 && provider?.authOk"
          class="p-4 text-xs text-[var(--warp-muted)]"
        >
          No pull requests found.
        </p>
      </aside>

      <section v-if="selected" class="min-w-0 flex-1 overflow-auto p-4">
        <h3 class="text-lg font-medium">{{ selected.title }}</h3>
        <p class="mt-1 text-sm text-[var(--warp-muted)]">
          #{{ selected.number }} · {{ selected.author }} · {{ selected.headRef }} →
          {{ selected.baseRef }}
        </p>
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
            :disabled="busy"
            @click="onCheckout(selected)"
          >
            Checkout branch
          </button>
        </div>
      </section>
      <section
        v-else-if="!loading && provider?.authOk"
        class="flex flex-1 items-center justify-center text-sm text-[var(--warp-muted)]"
      >
        Select a pull request
      </section>
    </div>
  </div>
</template>
