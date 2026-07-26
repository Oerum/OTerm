<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { BranchRefInfo } from "../types/branchManager";
import {
  defaultWorktreeBasePath,
  filterBranchRefs,
  resolveWorktreeStartPoint,
  type AgentWorktreeLaunchConfirm,
  type AgentWorktreeLaunchMode,
} from "../lib/agentWorktreeLaunch";
import ChevronDownIcon from "./ChevronDownIcon.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    repoRoot: string;
    currentBranch: string | null;
    branches: BranchRefInfo[];
    defaultWorktreeName: string;
    savedBasePath?: string | null;
    busy?: boolean;
    error?: string | null;
  }>(),
  {
    savedBasePath: null,
    busy: false,
    error: null,
  },
);

const emit = defineEmits<{
  confirm: [payload: AgentWorktreeLaunchConfirm];
  cancel: [];
  "update:basePath": [value: string];
}>();

const workspaceMode = ref<AgentWorktreeLaunchMode>("new");
const worktreeName = ref("");
const basePath = ref("");
const selectedRef = ref("");
const refQuery = ref("");
const startFromOrigin = ref(false);
const workspacePickerRef = ref<HTMLElement | null>(null);
const refPickerRef = ref<HTMLElement | null>(null);
const workspaceOpen = ref(false);
const refOpen = ref(false);
const launchRef = ref<HTMLButtonElement | null>(null);

const fieldClass =
  "w-full min-w-0 rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2.5 py-1.5 text-sm text-[var(--oterm-text)] outline-none transition focus:border-[var(--oterm-accent)]/50 disabled:cursor-not-allowed disabled:opacity-50";

const optionClass =
  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none";

const filteredRefs = computed(() => filterBranchRefs(props.branches, refQuery.value));

const resolvedStartPoint = computed(() =>
  resolveWorktreeStartPoint(selectedRef.value, startFromOrigin.value, props.branches),
);

const refButtonLabel = computed(() => {
  if (!selectedRef.value.trim()) return "Select branch";
  return startFromOrigin.value && !selectedRef.value.includes("/")
    ? `From origin/${selectedRef.value}`
    : `From ${selectedRef.value}`;
});

const canLaunch = computed(() => {
  if (props.busy) return false;
  if (workspaceMode.value === "current") return true;
  return Boolean(selectedRef.value.trim());
});

function resetForm() {
  workspaceMode.value = "new";
  worktreeName.value = props.defaultWorktreeName;
  basePath.value = defaultWorktreeBasePath(props.repoRoot, props.savedBasePath);
  selectedRef.value = props.currentBranch ?? props.branches.find((b) => b.isCurrent)?.name ?? "";
  refQuery.value = "";
  startFromOrigin.value = false;
  workspaceOpen.value = false;
  refOpen.value = false;
}

function closePickers() {
  workspaceOpen.value = false;
  refOpen.value = false;
}

function toggleWorkspacePicker() {
  workspaceOpen.value = !workspaceOpen.value;
  if (workspaceOpen.value) refOpen.value = false;
}

function toggleRefPicker() {
  refOpen.value = !refOpen.value;
  if (refOpen.value) workspaceOpen.value = false;
}

function selectWorkspace(mode: AgentWorktreeLaunchMode) {
  workspaceMode.value = mode;
  closePickers();
}

function selectRef(name: string) {
  selectedRef.value = name;
  closePickers();
}

async function browseBasePath() {
  const selected = await openDialog({
    directory: true,
    defaultPath: basePath.value || props.repoRoot,
  });
  if (typeof selected === "string" && selected.trim()) {
    basePath.value = selected;
    emit("update:basePath", selected);
  }
}

function onBasePathInput(value: string) {
  basePath.value = value;
  emit("update:basePath", value);
}

function submit() {
  if (!canLaunch.value) return;
  emit("confirm", {
    mode: workspaceMode.value,
    worktreeName: worktreeName.value.trim() || props.defaultWorktreeName,
    basePath: basePath.value.trim() || defaultWorktreeBasePath(props.repoRoot, props.savedBasePath),
    startPoint: resolvedStartPoint.value,
  });
}

function cancel() {
  closePickers();
  emit("cancel");
}

function onDocumentMouseDown(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (workspacePickerRef.value?.contains(target)) return;
  if (refPickerRef.value?.contains(target)) return;
  closePickers();
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    if (workspaceOpen.value || refOpen.value) {
      closePickers();
      return;
    }
    cancel();
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      resetForm();
      window.addEventListener("keydown", onKeyDown);
      document.addEventListener("mousedown", onDocumentMouseDown);
      await nextTick();
      launchRef.value?.focus();
    } else {
      closePickers();
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onDocumentMouseDown);
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
  document.removeEventListener("mousedown", onDocumentMouseDown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.open"
      class="no-drag fixed inset-0 z-[10001] flex min-w-0 items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      @click.self="cancel"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="worktree-launch-title"
        class="no-drag mx-auto w-full min-w-0 max-w-md overflow-visible rounded-xl border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] shadow-2xl"
        @submit.prevent="submit"
        @mousedown.stop
      >
      <div class="border-b border-[var(--oterm-border)] px-5 py-4">
        <h2 id="worktree-launch-title" class="text-sm font-medium text-[var(--oterm-text)]">
          Worktree
        </h2>
        <p class="mt-1 text-xs text-[var(--oterm-muted)]">
          Open a terminal in the current checkout or create a new linked worktree.
        </p>
      </div>

      <div class="grid min-w-0 gap-4 overflow-visible px-5 py-4">
        <p v-if="error" class="text-xs text-[var(--oterm-danger)]">{{ error }}</p>

        <label class="grid min-w-0 gap-1.5 text-xs text-[var(--oterm-muted)]">
          Workspace
          <div ref="workspacePickerRef" class="relative min-w-0">
            <button
              type="button"
              :class="[fieldClass, 'flex items-center gap-2 text-left']"
              aria-haspopup="listbox"
              :aria-expanded="workspaceOpen"
              :disabled="busy"
              @click="toggleWorkspacePicker"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" class="shrink-0 opacity-70" aria-hidden="true">
                <path d="M2.5 4.5h11v7h-11z" stroke-width="1.2" />
                <path d="M2.5 6.5h11" stroke-width="1.2" />
              </svg>
              <span class="min-w-0 flex-1 truncate">
                {{ workspaceMode === "current" ? "Current checkout" : "New worktree" }}
              </span>
              <ChevronDownIcon />
            </button>

            <div
              v-if="workspaceOpen"
              role="listbox"
              class="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] py-1 shadow-lg"
              @mousedown.stop
            >
              <button
                type="button"
                role="option"
                :aria-selected="workspaceMode === 'current'"
                :class="[
                  optionClass,
                  workspaceMode === 'current'
                    ? 'bg-[var(--oterm-accent-dim)] text-[var(--oterm-accent)]'
                    : 'text-[var(--oterm-text)]',
                ]"
                @click="selectWorkspace('current')"
              >
                <span class="truncate">Current checkout</span>
              </button>
              <button
                type="button"
                role="option"
                :aria-selected="workspaceMode === 'new'"
                :class="[
                  optionClass,
                  workspaceMode === 'new'
                    ? 'bg-[var(--oterm-accent-dim)] text-[var(--oterm-accent)]'
                    : 'text-[var(--oterm-text)]',
                ]"
                @click="selectWorkspace('new')"
              >
                <span class="truncate">New worktree</span>
              </button>
            </div>
          </div>
        </label>

        <template v-if="workspaceMode === 'new'">
          <label class="grid min-w-0 gap-1.5 text-xs text-[var(--oterm-muted)]">
            Worktree name
            <input
              v-model="worktreeName"
              type="text"
              :placeholder="defaultWorktreeName"
              :class="fieldClass"
              :disabled="busy"
            />
          </label>

          <label class="grid min-w-0 gap-1.5 text-xs text-[var(--oterm-muted)]">
            Worktree folder
            <div class="flex min-w-0 gap-2">
              <input
                :value="basePath"
                type="text"
                :class="fieldClass"
                :disabled="busy"
                @input="onBasePathInput(($event.target as HTMLInputElement).value)"
              />
              <button
                type="button"
                class="shrink-0 rounded-md border border-[var(--oterm-border)] px-2.5 py-1.5 text-xs text-[var(--oterm-text)] transition hover:bg-white/5 disabled:opacity-40"
                :disabled="busy"
                @click="browseBasePath"
              >
                Browse
              </button>
            </div>
          </label>

          <label class="grid min-w-0 gap-1.5 text-xs text-[var(--oterm-muted)]">
            Branch
            <div ref="refPickerRef" class="relative min-w-0">
              <button
                type="button"
                :class="[fieldClass, 'flex items-center gap-2 text-left']"
                aria-haspopup="listbox"
                :aria-expanded="refOpen"
                :disabled="busy"
                @click="toggleRefPicker"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" class="shrink-0 opacity-70" aria-hidden="true">
                  <path d="M4 2.5h5.5a1.5 1.5 0 0 1 1.5 1.5v2M4 13.5h5.5a1.5 1.5 0 0 0 1.5-1.5v-2M2.5 8h11" stroke-width="1.2" stroke-linecap="round" />
                </svg>
                <span class="min-w-0 flex-1 truncate">{{ refButtonLabel }}</span>
                <ChevronDownIcon />
              </button>

              <div
                v-if="refOpen"
                class="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] shadow-lg"
                @mousedown.stop
              >
                <div class="border-b border-[var(--oterm-border)] px-2.5 py-2">
                  <input
                    v-model="refQuery"
                    type="search"
                    placeholder="Search refs..."
                    :class="[fieldClass, 'text-xs']"
                  />
                </div>

                <div role="listbox" class="oterm-scroll max-h-52 overflow-y-auto py-1">
                  <p
                    v-if="filteredRefs.length === 0"
                    class="px-3 py-2 text-xs text-[var(--oterm-faint)]"
                  >
                    No refs found
                  </p>
                  <button
                    v-for="branch in filteredRefs"
                    :key="branch.name"
                    type="button"
                    role="option"
                    :aria-selected="selectedRef === branch.name"
                    :class="[
                      optionClass,
                      'justify-between',
                      selectedRef === branch.name
                        ? 'bg-[var(--oterm-accent-dim)] text-[var(--oterm-accent)]'
                        : 'text-[var(--oterm-text)]',
                    ]"
                    @click="selectRef(branch.name)"
                  >
                    <span class="min-w-0 truncate">{{ branch.name }}</span>
                    <span class="shrink-0 text-[10px] uppercase tracking-wide text-[var(--oterm-faint)]">
                      {{ branch.isCurrent ? "current" : branch.isRemote ? "remote" : "local" }}
                    </span>
                  </button>
                </div>

                <div class="flex items-center justify-between gap-2 border-t border-[var(--oterm-border)] px-2.5 py-2">
                  <span class="text-[11px] text-[var(--oterm-muted)]">Start from origin</span>
                  <button
                    type="button"
                    class="relative h-5 w-9 rounded-full transition"
                    :class="startFromOrigin ? 'bg-[var(--oterm-accent)]/40' : 'bg-white/10'"
                    role="switch"
                    :aria-checked="startFromOrigin"
                    @click="startFromOrigin = !startFromOrigin"
                  >
                    <span
                      class="absolute top-0.5 h-4 w-4 rounded-full bg-white transition"
                      :class="startFromOrigin ? 'left-4' : 'left-0.5'"
                    />
                  </button>
                </div>
              </div>
            </div>
          </label>
        </template>
      </div>

      <div class="flex justify-end gap-2 border-t border-[var(--oterm-border)] px-5 py-4">
        <button
          type="button"
          class="no-drag rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs text-[var(--oterm-text)] transition hover:bg-white/5"
          :disabled="busy"
          @mousedown.stop
          @click.stop="cancel"
        >
          Cancel
        </button>
        <button
          ref="launchRef"
          type="button"
          class="no-drag rounded-md bg-[var(--oterm-accent)]/15 px-3 py-1.5 text-xs font-medium text-[var(--oterm-accent)] transition hover:bg-[var(--oterm-accent)]/25 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!canLaunch"
          @mousedown.stop
          @click.stop="submit"
        >
          Open terminal
        </button>
      </div>
    </form>
    </div>
  </Teleport>
</template>
