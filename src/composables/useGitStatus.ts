import { ref, watch, type Ref } from "vue";
import { getGitStatus } from "../lib/gitApi";
import type { GitStatus } from "../types/git";

const emptyStatus = (): GitStatus => ({
  isRepo: false,
  branch: null,
  changedFiles: 0,
  additions: 0,
  deletions: 0,
});

export function useGitStatus(cwd: Ref<string | undefined>) {
  const status = ref<GitStatus>(emptyStatus());
  let refreshTimer: number | undefined;
  let requestId = 0;

  async function refresh() {
    const path = cwd.value;
    if (!path || path === "~") {
      status.value = emptyStatus();
      return;
    }

    const current = ++requestId;
    try {
      const next = await getGitStatus(path);
      if (current === requestId) {
        status.value = next;
      }
    } catch {
      if (current === requestId) {
        status.value = emptyStatus();
      }
    }
  }

  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      void refresh();
    }, 250);
  }

  async function refreshNow() {
    window.clearTimeout(refreshTimer);
    await refresh();
  }

  watch(cwd, scheduleRefresh, { immediate: true });

  return {
    status,
    refresh: scheduleRefresh,
    refreshNow,
  };
}
