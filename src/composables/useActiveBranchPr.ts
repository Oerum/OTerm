import { computed, ref, watch, type Ref } from "vue";
import { hasOpenPrForHead, isGithubPrCapable } from "../lib/createPrFlow";
import { detectPrProvider, listPullRequests } from "../lib/pullRequestApi";
import type { PullRequestSummary } from "../types/pullRequest";

const CACHE_TTL_MS = 30_000;

const prCache = new Map<
  string,
  { fetchedAt: number; refreshToken: number; prs: PullRequestSummary[] }
>();

async function loadPrsForRoot(
  root: string,
  token: number,
): Promise<PullRequestSummary[] | null> {
  const cached = prCache.get(root);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS && cached.refreshToken === token) {
    return cached.prs;
  }

  const provider = await detectPrProvider(root);
  if (!isGithubPrCapable(provider)) return null;

  const prs = provider.authOk ? await listPullRequests(root, false) : [];
  prCache.set(root, { fetchedAt: Date.now(), refreshToken: token, prs });
  return prs;
}

function findOpenPrForHead(prs: PullRequestSummary[], head: string): PullRequestSummary | null {
  if (!hasOpenPrForHead(prs, head)) return null;
  const normalized = head.toLowerCase();
  return (
    prs.find(
      (pr) =>
        pr.state.toUpperCase() === "OPEN" &&
        pr.headRef.trim().toLowerCase() === normalized,
    ) ?? null
  );
}

async function refreshActiveBranchPr(
  repoRoot: Ref<string | null>,
  branch: Ref<string | null>,
  refreshToken: Ref<number>,
  loading: Ref<boolean>,
  activePr: Ref<PullRequestSummary | null>,
  requestId: { current: number },
) {
  const root = repoRoot.value;
  const head = branch.value?.trim();
  if (!root || !head) {
    activePr.value = null;
    return;
  }

  const currentRequest = ++requestId.current;
  const token = refreshToken.value;
  loading.value = true;

  try {
    const prs = await loadPrsForRoot(root, token);
    if (currentRequest !== requestId.current) return;
    if (prs === null) {
      activePr.value = null;
      return;
    }
    activePr.value = findOpenPrForHead(prs, head);
  } catch {
    if (currentRequest === requestId.current) activePr.value = null;
  } finally {
    if (currentRequest === requestId.current) loading.value = false;
  }
}

export function useActiveBranchPr(
  repoRoot: Ref<string | null>,
  branch: Ref<string | null>,
  refreshToken: Ref<number>,
) {
  const loading = ref(false);
  const activePr = ref<PullRequestSummary | null>(null);
  const requestId = { current: 0 };
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function refresh() {
    return refreshActiveBranchPr(repoRoot, branch, refreshToken, loading, activePr, requestId);
  }

  function scheduleRefresh() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void refresh();
    }, 400);
  }

  watch([repoRoot, branch, refreshToken], scheduleRefresh, { immediate: true });

  return { loading, activePr, hasOpenPr: computed(() => activePr.value != null), refresh };
}
