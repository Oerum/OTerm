import { ref, watch, type Ref } from "vue";
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
import type { GitBranchList, GitCommitEntry, GitSourceControlStatus } from "../types/git";

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
  let refreshTimer: number | undefined;
  let requestId = 0;

  async function loadBranches(root: string) {
    try {
      branches.value = await listGitBranches(root);
    } catch {
      branches.value = emptyBranches();
    }
  }

  async function refresh(includeHistory = false, showLoading = true) {
    const path = cwd.value;
    if (!path || path === "~") {
      status.value = emptyStatus();
      branches.value = emptyBranches();
      history.value = [];
      return;
    }

    const current = ++requestId;
    if (showLoading) loading.value = true;
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
    } finally {
      if (current === requestId && showLoading) {
        loading.value = false;
      }
    }
  }

  function scheduleRefresh(includeHistory = false) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      void refresh(includeHistory, false);
    }, 250);
  }

  async function refreshNow(includeHistory = false) {
    window.clearTimeout(refreshTimer);
    await refresh(includeHistory, includeHistory);
  }

  async function runAction(action: () => Promise<void>, includeHistory = false) {
    await action();
    await refreshNow(includeHistory);
  }

  async function stage(paths: string[]) {
    const root = status.value.repoRoot;
    if (!root || paths.length === 0) return;
    await runAction(() => stageGitPaths(root, paths));
  }

  async function unstage(paths: string[]) {
    const root = status.value.repoRoot;
    if (!root || paths.length === 0) return;
    await runAction(() => unstageGitPaths(root, paths));
  }

  async function revert(paths: string[], untracked: boolean) {
    const root = status.value.repoRoot;
    if (!root || paths.length === 0) return;
    await runAction(() =>
      untracked ? revertUntrackedGitPaths(root, paths) : revertTrackedGitPaths(root, paths),
    );
  }

  async function commit(message: string) {
    const root = status.value.repoRoot;
    if (!root) return;
    await runAction(() => commitGitChanges(root, message), true);
  }

  async function fetch() {
    const root = status.value.repoRoot;
    if (!root) return;
    await runAction(() => fetchGitRepo(root));
  }

  async function pull() {
    const root = status.value.repoRoot;
    if (!root) return;
    await runAction(() => pullGitRepo(root), true);
  }

  async function push() {
    const root = status.value.repoRoot;
    if (!root) return;
    await runAction(() => pushGitRepo(root), true);
  }

  async function sync() {
    const root = status.value.repoRoot;
    if (!root) return;
    await runAction(() => syncGitRepo(root), true);
  }

  async function checkout(branch: string, isRemote: boolean) {
    const root = status.value.repoRoot;
    if (!root) return;
    await runAction(() => checkoutGitBranch(root, branch, isRemote), true);
  }

  watch(cwd, () => scheduleRefresh(true), { immediate: true });

  return {
    status,
    branches,
    history,
    loading,
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
