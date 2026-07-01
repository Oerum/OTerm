<script setup lang="ts">
import { ref, computed } from "vue";
import {
  CLI_AGENTS,
  type CliAgentId,
} from "../lib/terminalAgentMode";
import {
  agentStatusDotClass,
  agentStatusLabel,
  agentStatusTextClass,
  displayAgentStatus,
  type AgentDisplayStatus,
} from "../lib/agentStatus";
import type { AgentSemanticStatus, WorkspaceTab } from "../types/terminal";
import AgentFooterBadge from "./AgentFooterBadge.vue";

const props = defineProps<{
  tabs: WorkspaceTab[];
  active?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  launchAgent: [agentId: CliAgentId];
  selectTab: [tabId: string];
}>();

const search = ref("");
const selectedAgentId = ref<CliAgentId>("claude");

const AGENT_INFO: Record<
  CliAgentId,
  { description: string; capabilities: string[]; command: string }
> = {
  claude: {
    description:
      "Anthropic's high-speed CLI agent optimized for repository-wide search, testing, and multi-file code editing. Claude Code lives in your terminal and can understand and edit code across your entire codebase.",
    capabilities: [
      "Autonomous Code Editing",
      "Command Execution & Terminal Automation",
      "Semantic Code Search",
      "Test Run & Debugging",
    ],
    command: "claude",
  },
  gemini: {
    description:
      "Google's multimodal terminal companion, perfect for debugging, reasoning, and context understanding. Integrates Google's state-of-the-art Gemini models directly into your terminal workspace.",
    capabilities: [
      "Multimodal Understanding",
      "Complex Reasoning & Code Analysis",
      "Multi-Language Code Synthesis",
      "Real-Time Terminal Context Analysis",
    ],
    command: "gemini",
  },
  codex: {
    description:
      "OpenAI's programming specialist for code synthesis, documentation, and inline generation. Built to act as an intelligent developer companion for rapid prototyping.",
    capabilities: [
      "Natural Language to Code Translation",
      "Inline Code Refactoring",
      "Algorithm Synthesis",
      "Comprehensive Code Documentation",
    ],
    command: "npx @openai/codex",
  },
  opencode: {
    description:
      "An open-source AI agent designed for full-stack software engineering. Capable of planning, writing, testing, and verifying complex software components.",
    capabilities: [
      "Open-Source Model Integration",
      "Automated Planning & Execution",
      "Test-Driven Development Workflow",
      "Multi-File Code Modification",
    ],
    command: "opencode",
  },
  copilot: {
    description:
      "GitHub's terminal copilot for command suggestions and automation. Translates natural language requests into shell commands with explanations.",
    capabilities: [
      "Shell Command Translation",
      "Terminal Workflow Suggestion",
      "Command Syntax Explanations",
      "Context-Aware CLI Hints",
    ],
    command: "gh copilot suggest",
  },
  cursor: {
    description:
      "The agentic interface of Cursor, allowing workspace-level search and modifications. Designed for full repository awareness and fast editing.",
    capabilities: [
      "Repository Indexing & Retrieval",
      "Fast Code Generation & Patching",
      "Smart Terminal Context Parsing",
      "Multi-File Editing & Refactoring",
    ],
    command: "agent",
  },
  amp: {
    description:
      "Amphora's data-science and analytics agent, specializing in data pipeline engineering, visualization, and rapid mathematical processing.",
    capabilities: [
      "Data Pipeline Generation",
      "Statistical Analysis & Visualizations",
      "Jupyter/Notebook Integration",
      "Fast Python Prototyping",
    ],
    command: "amp",
  },
  droid: {
    description:
      "An autonomous agent tailored for mobile and Android applications development. Capable of running emulator tasks and UI verification.",
    capabilities: [
      "Mobile Platform Integration",
      "UI Automation & Verification",
      "Gradle Build Debugging",
      "Android SDK Command Runner",
    ],
    command: "droid",
  },
  pi: {
    description:
      "Inflection AI's supportive conversational assistant, helpful for brainstorming architectures, planning projects, and general advice.",
    capabilities: [
      "Architectural Brainstorming",
      "Empathetic Technical Advice",
      "Project Planning & Structuring",
      "Interactive Dialogue",
    ],
    command: "pi",
  },
  auggie: {
    description:
      "Augmented developer companion with speech-to-text input and audio output capabilities for hands-free coding.",
    capabilities: [
      "Voice Command Input",
      "Speech-to-Text Transcription",
      "Interactive Audio Response",
      "Hands-Free Terminal Operations",
    ],
    command: "auggie",
  },
  goose: {
    description:
      "Block's agentic coding companion that runs locally or on remote servers. Executes files, commands, and edits codebases autonomously.",
    capabilities: [
      "Local & Remote Tool Calling",
      "Direct File/Command Interactions",
      "MCP (Model Context Protocol) Support",
      "Autonomous Task Execution",
    ],
    command: "goose",
  },
  hermes: {
    description:
      "Local LLM coding companion, fine-tuned for precise programming tasks. Run completely locally on your hardware for privacy and speed.",
    capabilities: [
      "100% Offline Execution",
      "Deep Privacy Controls",
      "Fine-Tuned Coding Instructions",
      "Custom Model Integrations",
    ],
    command: "hermes",
  },
  vibe: {
    description:
      "Mistral's coding agent focusing on fast execution and agentic tasks. Harnesses Mistral Large and Codestral models.",
    capabilities: [
      "Vibe Coding Optimization",
      "Codestral Model Execution",
      "Fast Scripting & Scaffolding",
      "Command Line Helper",
    ],
    command: "vibe",
  },
  agy: {
    description:
      "Antigravity CLI orchestrator for advanced agentic operations. Connects your local environment to the Antigravity developer suite.",
    capabilities: [
      "Advanced Agentic Coding Rules",
      "Deep Workspace Analysis",
      "Tauri/Rust Integration Helper",
      "Agentic Self-Diagnostics",
    ],
    command: "agy",
  },
};

const getAgentInfo = (id: CliAgentId) => {
  return (
    AGENT_INFO[id] || {
      description: "An integrated command-line agent helper inside your terminal workspace.",
      capabilities: ["Terminal Automation", "Task Assistance", "Workspace Awareness"],
      command: id,
    }
  );
};

// Search filtering
const filteredAgents = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return CLI_AGENTS;
  return CLI_AGENTS.filter(
    (agent) =>
      agent.displayName.toLowerCase().includes(q) ||
      agent.id.toLowerCase().includes(q)
  );
});

// Selected Agent definition
const selectedAgent = computed(() => {
  return (
    CLI_AGENTS.find((agent) => agent.id === selectedAgentId.value) ??
    CLI_AGENTS[0]
  );
});

// Active Sessions grouping
interface ActiveSession {
  tabId: string;
  paneId: string;
  title: string;
  cwd: string;
  agentStatus: AgentSemanticStatus;
  agentStatusSeen: boolean;
}

function sessionDisplayStatus(session: ActiveSession): AgentDisplayStatus | null {
  if (session.agentStatus === "unknown") return null;
  return displayAgentStatus(session.agentStatus, session.agentStatusSeen);
}

function aggregateAgentStatus(sessions: ActiveSession[]): AgentDisplayStatus {
  if (sessions.length === 0) return "idle";
  const statuses = sessions
    .map((session) => sessionDisplayStatus(session))
    .filter(Boolean) as AgentDisplayStatus[];
  if (statuses.some((status) => status === "blocked")) return "blocked";
  if (statuses.some((status) => status === "working")) return "working";
  if (statuses.some((status) => status === "done")) return "done";
  if (statuses.some((status) => status === "idle")) return "idle";
  return "idle";
}

const activeSessionsByAgent = computed(() => {
  const map: Record<string, ActiveSession[]> = {};
  for (const tab of props.tabs) {
    if (tab.kind === "terminal") {
      for (const pane of tab.panes) {
        if (pane.activeAgentId) {
          if (!map[pane.activeAgentId]) {
            map[pane.activeAgentId] = [];
          }
          map[pane.activeAgentId].push({
            tabId: tab.id,
            paneId: pane.id,
            title: tab.title || "Terminal",
            cwd: pane.cwd,
            agentStatus: pane.agentStatus,
            agentStatusSeen: pane.agentStatusSeen,
          });
        }
      }
    }
  }
  return map;
});

const getActiveSessions = (agentId: string) => {
  return activeSessionsByAgent.value[agentId] || [];
};

const totalActiveAgentsCount = computed(() => {
  let count = 0;
  for (const list of Object.values(activeSessionsByAgent.value)) {
    count += list.length;
  }
  return count;
});

const isCopied = ref(false);
function copyLaunchCommand(cmd: string) {
  navigator.clipboard.writeText(cmd).then(() => {
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 1500);
  });
}
</script>

<template>
  <div class="flex h-full w-full flex-col bg-[var(--oterm-bg)] font-sans text-[var(--oterm-text)]">
    <!-- Header banner -->
    <header
      class="flex h-12 shrink-0 items-center justify-between border-b border-[var(--oterm-border)] bg-[var(--oterm-titlebar)] px-4"
    >
      <div class="flex items-center gap-3">
        <div class="flex items-center justify-center rounded-lg bg-[var(--oterm-accent)]/10 p-1.5 text-[var(--oterm-accent)]">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path
              d="M8 1.5a5.5 5.5 0 00-5.5 5.5c0 1.63.7 3.09 1.83 4.1a1 1 0 01.37.77v.88c0 .41.34.75.75.75h5.1c.41 0 .75-.34.75-.75v-.88a1 1 0 01.37-.77A5.5 5.5 0 008 1.5z"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M5.5 14h5M6.5 15.5h3"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <span class="text-sm font-semibold tracking-wide">Agent Control Center</span>
      </div>

      <!-- Quick stats -->
      <div class="flex items-center gap-6">
        <div class="flex items-center gap-1.5 text-xs text-[var(--oterm-muted)]">
          <span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Active Fleet: <span class="font-medium text-[var(--oterm-text)]">{{ totalActiveAgentsCount }}</span></span>
        </div>
        <div class="flex items-center gap-1.5 text-xs text-[var(--oterm-muted)]">
          <span>Available Agents: <span class="font-medium text-[var(--oterm-text)]">{{ CLI_AGENTS.length }}</span></span>
        </div>

        <button
          type="button"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)]/35 px-3 py-1 text-xs transition hover:bg-white/5 hover:text-white"
          @click="emit('close')"
        >
          Close View
        </button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 divide-x divide-[var(--oterm-border)]">
      <!-- Left sidebar: Directory -->
      <aside class="flex w-72 shrink-0 flex-col bg-[var(--oterm-sidebar)]">
        <div class="border-b border-[var(--oterm-border)] p-3">
          <div class="relative">
            <span class="absolute inset-y-0 left-0 flex items-center pl-2.5 text-[var(--oterm-faint)]">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <path
                  d="M11.5 11.5L14.5 14.5M13 7.5a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0z"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
              </svg>
            </span>
            <input
              v-model="search"
              type="search"
              placeholder="Search directory…"
              class="w-full rounded border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/40 py-1 pl-7.5 pr-2.5 text-xs text-[var(--oterm-text)] placeholder-[var(--oterm-faint)] outline-none focus:border-[var(--oterm-accent)]/30 transition duration-150"
            />
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-2 space-y-1 oterm-scroll">
          <button
            v-for="agent in filteredAgents"
            :key="agent.id"
            type="button"
            class="flex w-full items-center justify-between rounded-md p-2 text-left transition"
            :class="
              selectedAgentId === agent.id
                ? 'bg-white/5 shadow-sm border border-white/5'
                : 'hover:bg-white/5 border border-transparent'
            "
            @click="selectedAgentId = agent.id"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <AgentFooterBadge :agent-id="agent.id" size="md" />
              <div class="min-w-0">
                <div class="truncate text-xs font-semibold" :style="{ color: selectedAgentId === agent.id ? agent.brandColor : undefined }">
                  {{ agent.displayName }}
                </div>
                <div class="truncate text-[10px] text-[var(--oterm-muted)]">
                  cmd: {{ getAgentInfo(agent.id).command }}
                </div>
              </div>
            </div>

            <!-- Session indicator badge -->
            <div
              v-if="getActiveSessions(agent.id).length > 0"
              class="flex h-4 items-center gap-1 rounded bg-emerald-500/10 px-1.5 text-[9px] font-bold text-emerald-400 border border-emerald-400/20"
            >
              <span class="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
              {{ getActiveSessions(agent.id).length }}
            </div>
          </button>
        </div>
      </aside>

      <!-- Right Panel: Selection Workspace -->
      <main class="flex flex-1 flex-col bg-[var(--oterm-panel)]/35 overflow-y-auto p-6 oterm-scroll">
        <!-- Banner glow corresponding to selected agent brandColor -->
        <div class="relative flex flex-col rounded-xl border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/30 p-6 overflow-hidden">
          <div
            class="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full blur-[80px]"
            :style="{ backgroundColor: `${selectedAgent.brandColor}25` }"
          />

          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="flex items-center gap-4">
              <AgentFooterBadge :agent-id="selectedAgent.id" size="md" class="scale-150 transform origin-left" />
              <div>
                <h2 class="text-lg font-bold">{{ selectedAgent.displayName }}</h2>
                <div class="mt-0.5 flex items-center gap-2 text-xs">
                  <span class="text-[var(--oterm-muted)]">ID: <code class="rounded bg-white/5 px-1 font-mono text-[10px]">{{ selectedAgent.id }}</code></span>
                  <span class="h-1 w-1 rounded-full bg-[var(--oterm-border)]" />
                  <span class="flex items-center gap-1">
                    <span
                      class="h-1.5 w-1.5 rounded-full"
                      :class="agentStatusDotClass(aggregateAgentStatus(getActiveSessions(selectedAgent.id)))"
                    />
                    <span
                      class="text-xs font-semibold"
                      :class="agentStatusTextClass(aggregateAgentStatus(getActiveSessions(selectedAgent.id)))"
                    >
                      {{ agentStatusLabel(aggregateAgentStatus(getActiveSessions(selectedAgent.id))) }}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <!-- Primary Launch Action -->
            <button
              type="button"
              class="flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-md transition shrink-0"
              :style="{ backgroundColor: selectedAgent.brandColor }"
              @click="emit('launchAgent', selectedAgent.id)"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <path d="M4 12V4l8 4-8 4z" fill="currentColor" />
              </svg>
              <span>Launch {{ selectedAgent.displayName }}</span>
            </button>
          </div>

          <div class="mt-4 border-t border-[var(--oterm-border)] pt-4">
            <p class="text-xs leading-relaxed text-[var(--oterm-muted)]">
              {{ getAgentInfo(selectedAgent.id).description }}
            </p>
          </div>
        </div>

        <!-- Section: Launch Command -->
        <div class="mt-6 flex flex-col gap-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-[var(--oterm-muted)]">Terminal Launch Command</h3>
          <div class="flex items-center gap-2 rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/50 p-2.5 font-mono text-xs">
            <span class="text-[var(--oterm-accent)] shrink-0">$</span>
            <code class="flex-1 text-[var(--oterm-text)] truncate">{{ getAgentInfo(selectedAgent.id).command }}</code>
            <button
              type="button"
              class="rounded bg-white/5 px-2.5 py-1 text-[10px] font-medium hover:bg-white/10 transition"
              @click="copyLaunchCommand(getAgentInfo(selectedAgent.id).command)"
            >
              {{ isCopied ? 'Copied' : 'Copy' }}
            </button>
          </div>
        </div>

        <!-- Two column details layout -->
        <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <!-- Left Column: Active Sessions -->
          <div class="flex flex-col gap-3">
            <h3 class="text-xs font-bold uppercase tracking-wider text-[var(--oterm-muted)]">Active Sessions</h3>

            <div v-if="getActiveSessions(selectedAgent.id).length === 0" class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--oterm-border)] bg-[var(--oterm-bg)]/10 p-8 text-center">
              <svg class="h-6 w-6 text-[var(--oterm-faint)] mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-width="1.5" stroke-linecap="round" />
              </svg>
              <span class="text-xs font-medium text-[var(--oterm-muted)]">No active sessions running</span>
              <button
                type="button"
                class="mt-3 text-[10px] font-semibold text-[var(--oterm-accent)] hover:underline"
                @click="emit('launchAgent', selectedAgent.id)"
              >
                Start a session now
              </button>
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="session in getActiveSessions(selectedAgent.id)"
                :key="session.paneId"
                class="flex items-center justify-between rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/35 p-3 hover:bg-[var(--oterm-bg)]/50 transition"
              >
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <div class="text-xs font-semibold">{{ session.title }}</div>
                    <span
                      v-if="sessionDisplayStatus(session)"
                      class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold"
                      :class="agentStatusTextClass(sessionDisplayStatus(session)!)"
                    >
                      <span
                        class="h-1.5 w-1.5 rounded-full"
                        :class="agentStatusDotClass(sessionDisplayStatus(session)!)"
                      />
                      {{ agentStatusLabel(sessionDisplayStatus(session)!) }}
                    </span>
                  </div>
                  <div class="truncate font-mono text-[9px] text-[var(--oterm-muted)] mt-0.5" :title="session.cwd">
                    {{ session.cwd }}
                  </div>
                </div>

                <button
                  type="button"
                  class="rounded bg-[var(--oterm-accent)]/10 px-3 py-1 text-xs font-semibold text-[var(--oterm-accent)] hover:bg-[var(--oterm-accent)]/20 transition"
                  @click="emit('selectTab', session.tabId)"
                >
                  Connect
                </button>
              </div>
            </div>
          </div>

          <!-- Right Column: Capabilities / MCP Tools -->
          <div class="flex flex-col gap-3">
            <h3 class="text-xs font-bold uppercase tracking-wider text-[var(--oterm-muted)]">Capabilities</h3>

            <div class="rounded-xl border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/20 p-4">
              <ul class="space-y-2.5">
                <li
                  v-for="capability in getAgentInfo(selectedAgent.id).capabilities"
                  :key="capability"
                  class="flex items-start gap-2.5 text-xs text-[var(--oterm-text)]"
                >
                  <span class="mt-0.5 text-emerald-400 shrink-0">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                      <path d="M3.5 8.5l3 3 6-6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </span>
                  <span>{{ capability }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
