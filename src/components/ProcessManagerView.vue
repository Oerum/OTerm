<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { killProcess, listProcesses } from "../lib/processManagerApi";
import type { ProcessEntry, ProcessListSummary } from "../types/processManager";
import ConfirmDialog from "./ConfirmDialog.vue";
import PanelHeaderActions from "./PanelHeaderActions.vue";
import { pushAppToast } from "../lib/appToast";

import { useConfirmDialog } from "../composables/useConfirmDialog";

const props = defineProps<{
  active?: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const emptySummary = (): ProcessListSummary => ({
  processes: [],
  selfPid: 0,
});

const summary = ref<ProcessListSummary>(emptySummary());
const loading = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const searchFilter = ref("");
const { confirmOpen, pendingConfirm, askConfirm, resolveConfirm } = useConfirmDialog();

const quickFilters = [
  { id: "devenv", label: "Visual Studio", query: "devenv" },
  { id: "msbuild", label: "MSBuild", query: "msbuild" },
  { id: "antigravity", label: "Antigravity", query: "antigravity" },
  { id: "code", label: "VS Code", query: "code" },
] as const;

const activeQuickFilter = ref<string | null>(null);

const filteredProcesses = computed(() => {
  const q = searchFilter.value.trim().toLowerCase();
  if (!q) return summary.value.processes;
  return summary.value.processes.filter((process) => matchesQuery(process, q));
});

function matchesQuery(process: ProcessEntry, query: string) {
  return (
    process.name.toLowerCase().includes(query) ||
    String(process.pid).includes(query) ||
    (process.exe?.toLowerCase().includes(query) ?? false) ||
    process.cmd.toLowerCase().includes(query)
  );
}

function formatMemory(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    summary.value = await listProcesses();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function refreshUntilGone(pid: number) {
  for (const delayMs of [0, 120, 250, 450]) {
    if (delayMs) await sleep(delayMs);
    await load();
    if (!summary.value.processes.some((p) => p.pid === pid)) return;
  }
}

async function runKill(process: ProcessEntry) {
  busy.value = true;
  error.value = null;
  try {
    await killProcess(process.pid);
    pushAppToast(`Ended ${process.name} (${process.pid})`, "success");
    await refreshUntilGone(process.pid);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error.value = message;
    pushAppToast(message, "error");
  } finally {
    busy.value = false;
  }
}

function killSelected(process: ProcessEntry) {
  if (!process.isKillable) return;
  askConfirm({
    title: "End process?",
    message: `End "${process.name}" (PID ${process.pid})? Unsaved work in that app may be lost.`,
    confirmLabel: "End process",
    dangerous: true,
    onConfirm: () => void runKill(process),
  });
}

function applyQuickFilter(id: string, query: string) {
  if (activeQuickFilter.value === id) {
    activeQuickFilter.value = null;
    searchFilter.value = "";
    return;
  }
  activeQuickFilter.value = id;
  searchFilter.value = query;
}

onMounted(() => void load());
watch(
  () => props.active,
  (isActive) => {
    if (isActive) void load();
  },
);
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col bg-[var(--oterm-bg)] text-[var(--oterm-text)]">
    <header
      class="flex shrink-0 items-center gap-4 border-b border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-6 py-4 shadow-sm"
    >
      <div class="flex min-w-0 items-center gap-3">
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            class="text-violet-400"
          >
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </div>
        <div>
          <h2 class="text-base font-bold tracking-tight text-white">Process Manager</h2>
          <p class="mt-0.5 font-mono text-[11px] text-[var(--oterm-muted)]">
            {{ summary.processes.length }} processes
          </p>
        </div>
      </div>

      <div class="flex-1" />

      <PanelHeaderActions :loading="loading" :busy="busy" @refresh="load" @close="emit('close')" />
    </header>

    <div
      class="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--oterm-border)] px-6 py-3"
    >
      <input
        v-model="searchFilter"
        type="search"
        placeholder="Search name, PID, path, command..."
        class="min-w-[14rem] flex-1 rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-3 py-1.5 text-xs text-[var(--oterm-text)] outline-none focus:border-[var(--oterm-accent)]/40"
        @input="activeQuickFilter = null"
      />
      <button
        v-for="filter in quickFilters"
        :key="filter.id"
        type="button"
        class="rounded-full border px-2.5 py-1 text-[10px] font-medium transition"
        :class="
          activeQuickFilter === filter.id
            ? 'border-[var(--oterm-accent)]/40 bg-[var(--oterm-accent-dim)] text-[var(--oterm-accent)]'
            : 'border-[var(--oterm-border)] text-[var(--oterm-muted)] hover:border-[var(--oterm-border-strong)] hover:text-[var(--oterm-text)]'
        "
        @click="applyQuickFilter(filter.id, filter.query)"
      >
        {{ filter.label }}
      </button>
    </div>

    <p
      v-if="error"
      class="flex shrink-0 items-center gap-2 border-b border-[var(--oterm-danger)]/15 bg-[var(--oterm-danger)]/5 px-6 py-3 text-xs font-medium text-[var(--oterm-danger)]"
    >
      {{ error }}
    </p>

    <div class="oterm-scroll min-h-0 flex-1 overflow-auto px-6 py-4">
      <table class="w-full min-w-[720px] border-collapse text-left text-xs">
        <thead class="sticky top-0 z-10 bg-[var(--oterm-bg)]">
          <tr class="border-b border-[var(--oterm-border)] text-[10px] uppercase tracking-wide text-[var(--oterm-faint)]">
            <th class="px-2 py-2 font-semibold">Name</th>
            <th class="px-2 py-2 font-semibold">PID</th>
            <th class="px-2 py-2 font-semibold">Memory</th>
            <th class="px-2 py-2 font-semibold">Executable</th>
            <th class="px-2 py-2 font-semibold">Command</th>
            <th class="px-2 py-2 font-semibold text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="process in filteredProcesses"
            :key="process.pid"
            class="border-b border-[var(--oterm-border)]/60 transition hover:bg-white/[0.02]"
          >
            <td class="px-2 py-2 font-medium text-[var(--oterm-text)]">{{ process.name }}</td>
            <td class="px-2 py-2 font-mono text-[var(--oterm-muted)]">{{ process.pid }}</td>
            <td class="px-2 py-2 font-mono text-[var(--oterm-muted)]">
              {{ formatMemory(process.memory) }}
            </td>
            <td
              class="max-w-[16rem] truncate px-2 py-2 text-[var(--oterm-muted)]"
              :title="process.exe ?? undefined"
            >
              {{ process.exe ?? "—" }}
            </td>
            <td
              class="max-w-[20rem] truncate px-2 py-2 text-[var(--oterm-faint)]"
              :title="process.cmd || undefined"
            >
              {{ process.cmd || "—" }}
            </td>
            <td class="px-2 py-2 text-right">
              <button
                type="button"
                class="rounded-md border px-2 py-1 text-[10px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
                :class="
                  process.isKillable
                    ? 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10'
                    : 'border-[var(--oterm-border)] text-[var(--oterm-faint)]'
                "
                :disabled="!process.isKillable || busy"
                :title="process.isKillable ? 'End process' : 'Protected process'"
                @click="killSelected(process)"
              >
                End
              </button>
            </td>
          </tr>
          <tr v-if="!loading && filteredProcesses.length === 0">
            <td colspan="6" class="px-2 py-8 text-center text-sm text-[var(--oterm-faint)]">
              No matching processes
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ConfirmDialog
      :open="confirmOpen"
      :title="pendingConfirm?.title ?? ''"
      :message="pendingConfirm?.message ?? ''"
      :confirm-label="pendingConfirm?.confirmLabel"
      :dangerous="pendingConfirm?.dangerous"
      @confirm="resolveConfirm(true)"
      @cancel="resolveConfirm(false)"
    />
  </div>
</template>

<style scoped>
.pr-header-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  border-radius: 0.375rem;
  border: 1px solid var(--oterm-border);
  padding: 0.375rem 0.75rem;
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--oterm-muted);
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}

.pr-header-btn:hover:not(:disabled) {
  border-color: var(--oterm-border-strong);
  background: rgba(255, 255, 255, 0.05);
  color: var(--oterm-text);
}

.pr-header-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
