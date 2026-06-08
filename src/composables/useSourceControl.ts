import { computed, ref, watch, type Ref } from "vue";
import {
  checkoutGitBranch,
  commitGitChanges,
  fetchGitRepo,
  getGitLog,
  getSourceControlStatus,
  listGitBranches,
  pullGitRepo,
  pushGitRepo,
  revertTrackedGitPaths,
  revertUntrackedGitPaths,
  stageGitPaths,
  syncGitRepo,
  unstageGitPaths,
} from "../lib/gitApi";
import type { GitBranchList, GitCommitEntry, GitOperation, GitSourceControlStatus } from "../types/git";
import { GIT_OPERATION_LABELS } from "../types/git";

const emptyStatus = (): GitSourceControlStatus => ({
  isRepo: false,
  repoRoot: null,
  branch: null,
  upstream: null,
  ahead: 0,
  behind: 0,
  changedFiles: 0,
  additions: 0,
  deletions: 0,
  staged: [],
  changes: [],
  untracked: [],
});

const emptyBranches = (): GitBranchList => ({
  current: null,
  local: [],
  remote: [],
});

export function useSourceControl(cwd: Ref<string | undefined>) {
  const status = ref<GitSourceControlStatus>(emptyStatus());
  const branches = ref<GitBranchList>(emptyBranches());
  const history = ref<GitCommitEntry[]>([]);
  const loading = ref(false);
  const operation = ref<GitOperation | null>(null);
  let refreshTimer: number | undefined;
  let requestId = 0;

  const operationLabel = computed(() =>
    operation.value ? GIT_OPERATION_LABELS[operation.value] : null,
  );

  const busy = computed(() => loading.value || operation.value !== null);

  async function loadBranches(root: string) {
    try {
      branches.value = await listGitBranches(root);
    } catch {
      branches.value = emptyBranches();
    }
  }

  async function refreshData(includeHistory = false) {
    const path = cwd.value;
    if (!path || path === "~") {
      status.value = emptyStatus();
      branches.value = emptyBranches();
      history.value = [];
      return;
    }

    const current = ++requestId;
    try {
      const next = await getSourceControlStatus(path);
      if (current !== requestId) return;
      status.value = next;
      if (next.isRepo && next.repoRoot) {
        await loadBranches(next.repoRoot);
        if (includeHistory) {
          history.value = await getGitLog(next.repoRoot);
        }
      } else {
        branches.value = emptyBranches();
        history.value = [];
      }
    } catch {
      if (current === requestId) {
        status.value = emptyStatus();
        branches.value = emptyBranches();
        history.value = [];
      }
    }
  }

  function scheduleRefresh(includeHistory = false) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      void refreshData(includeHistory);
    }, 250);
  }

  async function withBusy<T>(op: GitOperation, work: () => Promise<T>): Promise<T> {
    operation.value = op;
    loading.value = true;
    try {
      return await work();
    } finally {
      operation.value = null;
      loading.value = false;
    }
  }

  async function refreshNow(includeHistory = false) {
    window.clearTimeout(refreshTimer);
    await withBusy("refresh", () => refreshData(includeHistory));
  }

  async function runAction(op: GitOperation, action: () => Promise<void>, includeHistory = false) {
    await withBusy(op, async () => {
      await action();
      await refreshData(includeHistory);
    });
  }

  async function stage(paths: string[]) {
    const root = status.value.repoRoot;
    if (!root || paths.length === 0) return;
    await runAction("stage", () => stageGitPaths(root, paths));
  }

  async function unstage(paths: string[]) {
    const root = status.value.repoRoot;
    if (!root || paths.length === 0) return;
    await runAction("unstage", () => unstageGitPaths(root, paths));
  }

  async function revert(paths: string[], untracked: boolean) {
    const root = status.value.repoRoot;
    if (!root || paths.length === 0) return;
    await runAction("revert", () =>
      untracked ? revertUntrackedGitPaths(root, paths) : revertTrackedGitPaths(root, paths),
    );
  }

  async function commit(message: string) {
    const root = status.value.repoRoot;
    if (!root) return;
    await runAction("commit", () => commitGitChanges(root, message), true);
  }

  async function fetch() {
    const root = status.value.repoRoot;
    if (!root) return;
    await runAction("fetch", () => fetchGitRepo(root));
  }

  async function pull() {
    const root = status.value.repoRoot;
    if (!root) return;
    await runAction("pull", () => pullGitRepo(root), true);
  }

  async function push() {
    const root = status.value.repoRoot;
    if (!root) return;
    await runAction("push", () => pushGitRepo(root), true);
  }

  async function sync() {
    const root = status.value.repoRoot;
    if (!root) return;
    await runAction("sync", () => syncGitRepo(root), true);
  }

  async function checkout(branch: string, isRemote: boolean) {
    const root = status.value.repoRoot;
    if (!root) return;
    await runAction("checkout", () => checkoutGitBranch(root, branch, isRemote), true);
  }

  watch(cwd, () => scheduleRefresh(true), { immediate: true });

  return {
    status,
    branches,
    history,
    loading,
    operation,
    operationLabel,
    busy,
    refresh: () => refreshNow(true),
    stage,
    unstage,
    revert,
    commit,
    fetch,
    pull,
    push,
    sync,
    checkout,
  };
}
