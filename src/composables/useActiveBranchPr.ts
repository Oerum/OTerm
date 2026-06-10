import { computed, ref, watch, type Ref } from "vue";
import { hasOpenPrForHead, isGithubPrCapable } from "../lib/createPrFlow";
import { detectPrProvider, listPullRequests } from "../lib/pullRequestApi";
import type { PullRequestSummary } from "../types/pullRequest";

const CACHE_TTL_MS = 30_000;

const prCache = new Map<
  string,
  { fetchedAt: number; prs: PullRequestSummary[] }
>();

export function useActiveBranchPr(
  repoRoot: Ref<string | null>,
  branch: Ref<string | null>,
  refreshToken: Ref<number>,
) {
  const loading = ref(false);
  const activePr = ref<PullRequestSummary | null>(null);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let requestId = 0;

  async function refresh() {
    const root = repoRoot.value;
    const head = branch.value?.trim();
    if (!root || !head) {
      activePr.value = null;
      return;
    }

    const currentRequest = ++requestId;
    loading.value = true;

    try {
      const provider = await detectPrProvider(root);
      if (!isGithubPrCapable(provider)) {
        if (currentRequest === requestId) activePr.value = null;
        return;
      }

      const cacheKey = root;
      const cached = prCache.get(cacheKey);
      let prs: PullRequestSummary[];

      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        prs = cached.prs;
      } else {
        prs = provider.authOk
          ? await listPullRequests(root, false)
          : [];
        prCache.set(cacheKey, { fetchedAt: Date.now(), prs });
      }

      if (currentRequest !== requestId) return;

      if (!hasOpenPrForHead(prs, head)) {
        activePr.value = null;
        return;
      }

      const normalized = head.toLowerCase();
      activePr.value =
        prs.find(
          (pr) =>
            pr.state.toUpperCase() === "OPEN" &&
            pr.headRef.trim().toLowerCase() === normalized,
        ) ?? null;
    } catch {
      if (currentRequest === requestId) activePr.value = null;
    } finally {
      if (currentRequest === requestId) loading.value = false;
    }
  }

  function scheduleRefresh() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void refresh();
    }, 400);
  }

  watch([repoRoot, branch, refreshToken], scheduleRefresh, { immediate: true });

  const hasOpenPr = computed(() => activePr.value != null);

  return { loading, activePr, hasOpenPr, refresh };
}
