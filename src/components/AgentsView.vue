<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import {
  CLI_AGENTS,
  supportsUnslothRuntime,
  buildAgentLaunchCommand,
  type CliAgentId,
  type CliAgentDefinition,
  type AgentLaunchRequest,
} from "../lib/terminalAgentMode";
import { buildAgentOpsRows } from "../lib/agentOpsBoard";
import type { WorkspaceTab } from "../types/terminal";
import AgentOpsRow from "./AgentOpsRow.vue";
import AgentFooterBadge from "./AgentFooterBadge.vue";
import { openUrl } from "../lib/secureOpenUrl";
import { pushAppToast } from "../lib/appToast";

const props = withDefaults(
  defineProps<{
    tabs: WorkspaceTab[];
    launchPending?: boolean;
    launchError?: string | null;
  }>(),
  {
    launchPending: false,
    launchError: null,
  },
);

const emit = defineEmits<{
  close: [];
  launchAgent: [request: AgentLaunchRequest];
  selectPane: [tabId: string, paneId: string];
}>();

const searchQuery = ref("");
const searchInputRef = ref<HTMLInputElement | null>(null);
const agentListRef = ref<HTMLElement | null>(null);
const selectedAgentId = ref<CliAgentId>(CLI_AGENTS[0]?.id ?? "claude");
const selectedRuntime = ref<"native" | "unsloth">("native");
const isLaunching = computed(() => Boolean(props.launchPending));

const rows = computed(() => buildAgentOpsRows(props.tabs));
const attentionRows = computed(() => rows.value.filter((r) => r.needsAttention));
const otherRows = computed(() => rows.value.filter((r) => !r.needsAttention));

const filteredAgents = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return CLI_AGENTS;
  return CLI_AGENTS.filter((agent) => {
    return (
      agent.displayName.toLowerCase().includes(query) ||
      agent.id.toLowerCase().includes(query) ||
      agent.commandPrefixes.some((p) => p.toLowerCase().includes(query)) ||
      (agent.launchCommand && agent.launchCommand.toLowerCase().includes(query))
    );
  });
});

const selectedAgent = computed<CliAgentDefinition | null>(() => {
  if (filteredAgents.value.length === 0) return null;
  return (
    filteredAgents.value.find((a) => a.id === selectedAgentId.value) ??
    filteredAgents.value[0] ??
    null
  );
});

const canUseUnsloth = computed(
  () => (selectedAgent.value ? supportsUnslothRuntime(selectedAgent.value.id) : false),
);

watch(selectedAgentId, (newId) => {
  if (!supportsUnslothRuntime(newId)) {
    selectedRuntime.value = "native";
  }
});

watch(filteredAgents, (list) => {
  if (list.length > 0) {
    if (!list.some((a) => a.id === selectedAgentId.value)) {
      selectedAgentId.value = list[0]!.id;
    }
  }
});

const exactLaunchCommand = computed(() => {
  if (!selectedAgent.value) return "";
  try {
    return buildAgentLaunchCommand({
      agentId: selectedAgent.value.id,
      runtime: selectedRuntime.value,
    });
  } catch {
    return (
      selectedAgent.value.launchCommand ??
      selectedAgent.value.commandPrefixes[0] ??
      selectedAgent.value.id
    );
  }
});

function selectAgent(id: CliAgentId) {
  selectedAgentId.value = id;
}

function selectRuntime(runtime: "native" | "unsloth") {
  if (runtime === "unsloth" && !canUseUnsloth.value) return;
  selectedRuntime.value = runtime;
}

function onKeydown(event: KeyboardEvent, focusRoster: boolean) {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveSelection(event.key === "ArrowDown" ? 1 : -1, focusRoster);
  } else if (event.key === "Enter" && selectedAgent.value && !props.launchPending) {
    event.preventDefault();
    launch();
  }
}

function moveSelection(delta: number, focusRoster: boolean) {
  const list = filteredAgents.value;
  if (list.length === 0) return;
  const currentIndex = list.findIndex((a) => a.id === selectedAgentId.value);
  const nextIndex = Math.max(0, Math.min(list.length - 1, (currentIndex >= 0 ? currentIndex : 0) + delta));
  selectedAgentId.value = list[nextIndex]!.id;
  void nextTick(() => {
    const activeEl = agentListRef.value?.querySelector<HTMLElement>(`[data-agent-id="${selectedAgentId.value}"]`);
    if (focusRoster) activeEl?.focus();
    activeEl?.scrollIntoView({ block: "nearest" });
  });
}

function jumpTo(tabId: string, paneId: string) {
  emit("selectPane", tabId, paneId);
  emit("close");
}

function launch() {
  if (props.launchPending) return;
  if (!selectedAgent.value) return;

  emit("launchAgent", {
    agentId: selectedAgent.value.id,
    runtime: selectedRuntime.value,
  });
}

async function openDocs() {
  const url = selectedAgent.value?.docsUrl;
  if (!url) return;
  try {
    await openUrl(url);
  } catch {
    pushAppToast("Failed to open official documentation link", "error");
  }
}

async function openUnslothDocs() {
  try {
    await openUrl("https://unsloth.ai/docs/integrations/unsloth-start");
  } catch {
    pushAppToast("Failed to open Unsloth setup guide", "error");
  }
}

onMounted(() => {
  searchInputRef.value?.focus();
});

</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col bg-[var(--oterm-bg)] text-[var(--oterm-text)] outline-none"
    tabindex="-1"
    @keydown.esc.prevent.stop="emit('close')"
  >
    <!-- Header -->
    <header
      class="flex shrink-0 items-center justify-between border-b border-[var(--oterm-border)] px-4 py-2.5 bg-[var(--oterm-titlebar)]"
    >
      <div class="flex items-center gap-2">
        <h1 class="text-xs font-semibold uppercase tracking-wider text-[var(--oterm-text)]">
          Agent Launcher &amp; Ops
        </h1>
        <span
          class="rounded px-1.5 py-0.5 text-[10px] font-mono bg-[var(--oterm-elevated)] border border-[var(--oterm-border)] text-[var(--oterm-muted)]"
        >
          {{ CLI_AGENTS.length }} agents
        </span>
      </div>
      <button
        type="button"
        class="rounded-md border border-[var(--oterm-border)] px-2.5 py-1 text-xs text-[var(--oterm-muted)] transition-colors hover:bg-white/5 hover:text-[var(--oterm-text)] focus-visible:border-[var(--oterm-accent)] focus-visible:outline-none"
        @click="emit('close')"
      >
        Close <kbd class="ml-1 text-[10px] font-mono text-[var(--oterm-faint)]">Esc</kbd>
      </button>
    </header>

    <!-- Main Body: Responsive two-column layout -->
    <div class="flex min-h-0 flex-1 flex-col lg:flex-row overflow-hidden">
      <!-- Left: Launcher Section -->
      <section
        class="flex min-h-0 flex-1 flex-col border-b lg:border-b-0 lg:border-r border-[var(--oterm-border)] overflow-hidden"
      >
        <!-- Search bar -->
        <div class="p-3 border-b border-[var(--oterm-border)] bg-[var(--oterm-panel)]">
          <div class="relative flex items-center">
            <svg
              class="absolute left-3 h-4 w-4 text-[var(--oterm-faint)] pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              class="w-full rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-bg)] py-1.5 pl-9 pr-8 text-xs text-[var(--oterm-text)] placeholder-[var(--oterm-faint)] outline-none focus:border-[var(--oterm-accent)] focus:ring-1 focus:ring-[var(--oterm-accent)]"
              placeholder="Search 25 CLI agents by name, prefix, or command…"
              aria-label="Filter agents"
              @keydown="onKeydown($event, false)"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-2 text-xs text-[var(--oterm-faint)] hover:text-[var(--oterm-text)] px-1"
              aria-label="Clear search"
              @click="searchQuery = ''; searchInputRef?.focus();"
            >
              ✕
            </button>
          </div>
          <div class="flex items-center justify-between mt-1.5 px-0.5 text-[10px] text-[var(--oterm-faint)]">
            <span>{{ filteredAgents.length }} matching</span>
            <span>Use <kbd class="font-mono">↑</kbd><kbd class="font-mono">↓</kbd> to navigate, <kbd class="font-mono">Enter</kbd> to launch, <kbd class="font-mono">Esc</kbd> to close</span>
          </div>
        </div>

        <!-- Agent Roster + Launcher Detail -->
        <div class="flex min-h-0 flex-1 flex-col sm:flex-row overflow-hidden">
          <!-- Roster list -->
          <div
            ref="agentListRef"
            class="max-h-36 sm:max-h-none sm:w-60 md:w-64 shrink-0 overflow-y-auto oterm-scroll border-b sm:border-b-0 sm:border-r border-[var(--oterm-border)] bg-[var(--oterm-bg)] p-1.5 space-y-0.5"
            role="listbox"
            aria-label="Available CLI agents"
            @keydown="onKeydown($event, true)"
          >
            <div
              v-if="filteredAgents.length === 0"
              class="p-4 text-center text-xs text-[var(--oterm-faint)]"
            >
              No agents matching "{{ searchQuery }}"
            </div>
            <button
              v-for="agent in filteredAgents"
              :key="agent.id"
              :data-agent-id="agent.id"
              type="button"
              role="option"
              :aria-selected="agent.id === selectedAgentId"
              :tabindex="agent.id === selectedAgentId ? 0 : -1"
              class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors duration-100 outline-none select-none focus-visible:ring-1 focus-visible:ring-[var(--oterm-accent)]"
              :class="[
                agent.id === selectedAgentId
                  ? 'bg-[var(--oterm-accent-dim)] text-[var(--oterm-text)] border border-[var(--oterm-accent)]/50 font-medium'
                  : 'text-[var(--oterm-muted)] hover:bg-white/5 hover:text-[var(--oterm-text)] border border-transparent',
              ]"
              @click="selectAgent(agent.id)"
            >
              <AgentFooterBadge :agent-id="agent.id" size="sm" />
              <span class="truncate flex-1">{{ agent.displayName }}</span>
              <span
                v-if="supportsUnslothRuntime(agent.id)"
                class="shrink-0 rounded px-1 text-[9px] font-mono uppercase bg-[var(--oterm-elevated)] border border-[var(--oterm-border)] text-[var(--oterm-accent)]"
                title="Supports Unsloth local runtime"
              >
                Unsloth
              </span>
            </button>
          </div>

          <!-- Selected Agent Launcher Panel -->
          <div
            v-if="selectedAgent"
            class="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 bg-[var(--oterm-panel)] space-y-4"
          >
            <!-- Launch error banner if present -->
            <div
              v-if="props.launchError"
              role="alert"
              class="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300"
            >
              {{ props.launchError }}
            </div>

            <!-- Agent Header info -->
            <div class="flex items-center gap-3">
              <AgentFooterBadge :agent-id="selectedAgent.id" size="md" />
              <div class="min-w-0 flex-1">
                <h2 class="text-sm font-semibold text-[var(--oterm-text)] flex items-center gap-2">
                  {{ selectedAgent.displayName }}
                  <span class="font-mono text-xs text-[var(--oterm-faint)] font-normal">
                    ({{ selectedAgent.id }})
                  </span>
                </h2>
                <div class="text-[11px] text-[var(--oterm-muted)] font-mono">
                  Default: {{ selectedAgent.launchCommand ?? selectedAgent.commandPrefixes[0] }}
                </div>
              </div>
              <button
                v-if="selectedAgent.docsUrl"
                type="button"
                class="shrink-0 rounded border border-[var(--oterm-border)] bg-[var(--oterm-elevated)] px-2 py-1 text-[11px] text-[var(--oterm-muted)] hover:text-[var(--oterm-text)] hover:border-[var(--oterm-border-strong)] transition-colors focus-visible:ring-1 focus-visible:ring-[var(--oterm-accent)] outline-none"
                title="Open official documentation"
                @click="openDocs"
              >
                Docs ↗
              </button>
            </div>

            <!-- Runtime Choice -->
            <div class="rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-elevated)] p-3 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-semibold uppercase tracking-wider text-[var(--oterm-faint)]">
                  Launch Runtime
                </span>
                <button
                  v-if="canUseUnsloth"
                  type="button"
                  class="text-[10px] text-[var(--oterm-accent)] hover:underline focus-visible:underline focus-visible:outline-none"
                  @click="openUnslothDocs"
                >
                  Unsloth setup guide ↗
                </button>
              </div>
              <div
                role="group"
                aria-label="Launch Runtime"
                class="grid grid-cols-2 gap-2"
              >
                <button
                  type="button"
                  :aria-pressed="selectedRuntime === 'native'"
                  class="flex flex-col items-start rounded-md border p-2 text-left transition-colors duration-100 focus-visible:ring-1 focus-visible:ring-[var(--oterm-accent)] outline-none"
                  :class="[
                    selectedRuntime === 'native'
                      ? 'border-[var(--oterm-accent)] bg-[var(--oterm-accent-dim)] text-[var(--oterm-text)]'
                      : 'border-[var(--oterm-border)] bg-[var(--oterm-bg)] text-[var(--oterm-muted)] hover:text-[var(--oterm-text)] hover:bg-white/5',
                  ]"
                  @click="selectRuntime('native')"
                >
                  <span class="text-xs font-medium">Native CLI</span>
                  <span class="text-[10px] text-[var(--oterm-faint)]">Direct shell execution</span>
                </button>

                <button
                  type="button"
                  :aria-pressed="selectedRuntime === 'unsloth'"
                  :aria-disabled="!canUseUnsloth"
                  :disabled="!canUseUnsloth"
                  class="flex flex-col items-start rounded-md border p-2 text-left transition-colors duration-100 focus-visible:ring-1 focus-visible:ring-[var(--oterm-accent)] outline-none"
                  :class="[
                    !canUseUnsloth
                      ? 'opacity-40 cursor-not-allowed border-[var(--oterm-border)] bg-[var(--oterm-bg)] text-[var(--oterm-faint)]'
                      : selectedRuntime === 'unsloth'
                        ? 'border-[var(--oterm-accent)] bg-[var(--oterm-accent-dim)] text-[var(--oterm-text)]'
                        : 'border-[var(--oterm-border)] bg-[var(--oterm-bg)] text-[var(--oterm-muted)] hover:text-[var(--oterm-text)] hover:bg-white/5',
                  ]"
                  :title="canUseUnsloth ? 'Launch via Unsloth local runtime' : 'Unsloth runtime not supported for this agent'"
                  @click="selectRuntime('unsloth')"
                >
                  <span class="text-xs font-medium flex items-center gap-1.5">
                    Unsloth (Local)
                    <span
                      v-if="canUseUnsloth"
                      class="rounded bg-[var(--oterm-accent)]/15 border border-[var(--oterm-accent)]/30 px-1 py-0.2 text-[9px] text-[var(--oterm-accent)] font-normal"
                    >
                      Compatible
                    </span>
                  </span>
                  <span class="text-[10px] text-[var(--oterm-faint)]">
                    {{ canUseUnsloth ? 'Local model runtime' : 'Unsupported' }}
                  </span>
                </button>
              </div>
            </div>

            <!-- Exact Command Preview (Wrapped, never clipped/truncated) -->
            <div class="rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-elevated)] p-3 space-y-1.5">
              <div class="text-[10px] font-semibold uppercase tracking-wider text-[var(--oterm-faint)]">
                Launch Command Preview
              </div>
              <div class="rounded border border-[var(--oterm-border)] bg-[var(--oterm-bg)] px-2.5 py-2 font-mono text-xs text-[var(--oterm-accent)]">
                <code class="block break-all whitespace-pre-wrap select-all">{{ exactLaunchCommand }}</code>
              </div>
            </div>

            <!-- Launch Button Action -->
            <div class="pt-2">
              <button
                type="button"
                class="w-full rounded-md border border-[var(--oterm-accent)] bg-[var(--oterm-accent-dim)] py-2 text-xs font-semibold text-[var(--oterm-text)] transition-colors hover:bg-[var(--oterm-elevated)] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--oterm-accent)]"
                :disabled="props.launchPending || isLaunching"
                @click="launch"
              >
                <span v-if="props.launchPending || isLaunching">Starting terminal…</span>
                <span v-else>Launch {{ selectedAgent.displayName }}</span>
              </button>
            </div>
          </div>

          <!-- Empty selection state when search yielded 0 results -->
          <div
            v-else
            class="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center text-xs text-[var(--oterm-faint)] bg-[var(--oterm-panel)]"
          >
            <p>No agent selected. Type to search or clear the filter.</p>
          </div>
        </div>
      </section>

      <!-- Right: Active Agent Sessions / Needs Input -->
      <section
        class="flex min-h-0 max-h-40 lg:max-h-none w-full lg:w-80 shrink-0 flex-col overflow-y-auto p-4 bg-[var(--oterm-bg)] space-y-4"
      >
        <div v-if="attentionRows.length">
          <h2 class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-red-400 flex items-center gap-1.5">
            <span class="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            Needs input ({{ attentionRows.length }})
          </h2>
          <ul class="space-y-1.5">
            <AgentOpsRow
              v-for="row in attentionRows"
              :key="`${row.tabId}:${row.paneId}`"
              :row="row"
              attention
              @jump="jumpTo"
            />
          </ul>
        </div>

        <div>
          <h2 class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--oterm-faint)]">
            Active agent sessions ({{ rows.length }})
          </h2>
          <div
            v-if="rows.length === 0"
            class="rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-panel)] p-4 text-center text-xs text-[var(--oterm-faint)]"
          >
            No active agents running. Launch one from the list.
          </div>
          <ul v-else class="space-y-1.5">
            <AgentOpsRow
              v-for="row in otherRows"
              :key="`${row.tabId}:${row.paneId}`"
              :row="row"
              @jump="jumpTo"
            />
          </ul>
        </div>
      </section>
    </div>
  </div>
</template>
