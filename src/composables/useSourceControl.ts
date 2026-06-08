import { ref, watch, type Ref } from "vue";
import {
  commitGitChanges,
  getGitLog,
  getSourceControlStatus,
  revertTrackedGitPaths,
  revertUntrackedGitPaths,
  stageGitPaths,
  unstageGitPaths,
} from "../lib/gitApi";
import type { GitCommitEntry, GitSourceControlStatus } from "../types/git";

const emptyStatus = (): GitSourceControlStatus => ({
  isRepo: false,
  repoRoot: null,
  branch: null,
  changedFiles: 0,
  additions: 0,
  deletions: 0,
  staged: [],
  changes: [],
  untracked: [],
});

export function useSourceControl(cwd: Ref<string | undefined>) {
  const status = ref<GitSourceControlStatus>(emptyStatus());
  const history = ref<GitCommitEntry[]>([]);
  const loading = ref(false);
  let refreshTimer: number | undefined;
  let requestId = 0;

  async function refresh(includeHistory = false, showLoading = true) {
    const path = cwd.value;
    if (!path || path === "~") {
      status.value = emptyStatus();
      history.value = [];
      return;
    }

    const current = ++requestId;
    if (showLoading) loading.value = true;
    try {
      const next = await getSourceControlStatus(path);
      if (current !== requestId) return;
      status.value = next;
      if (includeHistory && next.isRepo && next.repoRoot) {
        history.value = await getGitLog(next.repoRoot);
      } else if (!next.isRepo) {
        history.value = [];
      }
    } catch {
      if (current === requestId) {
        status.value = emptyStatus();
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

  watch(cwd, () => scheduleRefresh(true), { immediate: true });

  return {
    status,
    history,
    loading,
    refresh: () => refreshNow(true),
    stage,
    unstage,
    revert,
    commit,
  };
}
