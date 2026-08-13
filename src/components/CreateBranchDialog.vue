<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import type { BranchRefInfo } from "../types/branchManager";
import ChevronDownIcon from "./ChevronDownIcon.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    branches: BranchRefInfo[];
    name: string;
    source: string;
    extraSource?: { label: string; value: string } | null;
    submitDisabled?: boolean;
    error?: string | null;
  }>(),
  {
    extraSource: null,
    submitDisabled: false,
    error: null,
  },
);

const emit = defineEmits<{
  "update:name": [value: string];
  "update:source": [value: string];
  confirm: [];
  cancel: [];
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const sourcePickerRef = ref<HTMLElement | null>(null);
const sourceOpen = ref(false);

const localBranches = computed(() => props.branches.filter((b) => !b.isRemote));
const remoteBranches = computed(() => props.branches.filter((b) => b.isRemote));

const hasSourceOptions = computed(
  () =>
    localBranches.value.length > 0 ||
    remoteBranches.value.length > 0 ||
    !!props.extraSource,
);

const sourceLabel = computed(() => {
  if (!props.source.trim()) {
    return hasSourceOptions.value ? "Select branch" : "No branches available";
  }
  if (props.extraSource?.value === props.source) return props.extraSource.label;
  const branch = props.branches.find((b) => b.name === props.source);
  if (branch?.isCurrent) return `${branch.name} (current)`;
  return props.source;
});

const fieldClass =
  "w-full min-w-0 rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2.5 py-1.5 text-sm text-[var(--oterm-text)] outline-none transition focus:border-[var(--oterm-accent)]/50 disabled:cursor-not-allowed disabled:opacity-50";

const optionClass =
  "flex w-full items-center px-2.5 py-1.5 text-left text-sm transition hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none";

function toggleSourcePicker() {
  if (!hasSourceOptions.value) return;
  sourceOpen.value = !sourceOpen.value;
}

function closeSourcePicker() {
  sourceOpen.value = false;
}

function selectSource(value: string) {
  emit("update:source", value);
  closeSourcePicker();
}

function onDocumentMouseDown(event: MouseEvent) {
  if (!sourceOpen.value) return;
  const target = event.target;
  if (target instanceof Node && sourcePickerRef.value?.contains(target)) return;
  closeSourcePicker();
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    if (sourceOpen.value) {
      closeSourcePicker();
      return;
    }
    emit("cancel");
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      window.addEventListener("keydown", onKeyDown);
      document.addEventListener("mousedown", onDocumentMouseDown);
      await nextTick();
      inputRef.value?.focus();
      inputRef.value?.select();
    } else {
      closeSourcePicker();
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
  <div
    v-if="open"
    class="absolute inset-0 z-50 flex min-w-0 items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
    @click.self="emit('cancel')"
  >
    <form
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-branch-dialog-title"
      class="mx-auto w-full min-w-0 max-w-sm overflow-visible rounded-xl border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] shadow-2xl"
      @submit.prevent="emit('confirm')"
      @mousedown.stop
    >
      <div class="border-b border-[var(--oterm-border)] px-5 py-4">
        <h2 id="create-branch-dialog-title" class="text-sm font-medium text-[var(--oterm-text)]">
          Create branch
        </h2>
      </div>

      <div class="relative z-20 grid min-w-0 gap-4 overflow-visible px-5 py-4">
        <p v-if="error" class="text-xs text-[var(--oterm-danger)]">{{ error }}</p>
        <label class="grid min-w-0 gap-1.5 text-xs text-[var(--oterm-muted)]">
          Branch name
          <input
            ref="inputRef"
            :value="name"
            type="text"
            aria-label="Branch name"
            placeholder="feature/my-branch"
            :class="fieldClass"
            @input="emit('update:name', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label class="grid min-w-0 gap-1.5 text-xs text-[var(--oterm-muted)]">
          Source
          <div ref="sourcePickerRef" class="relative min-w-0">
            <button
              type="button"
              aria-label="Source branch"
              :class="[fieldClass, 'flex items-center gap-2 text-left']"
              :disabled="!hasSourceOptions"
              aria-haspopup="listbox"
              :aria-expanded="sourceOpen"
              @click="toggleSourcePicker"
            >
              <span class="min-w-0 flex-1 truncate">{{ sourceLabel }}</span>
              <ChevronDownIcon />
            </button>

            <div
              v-if="sourceOpen"
              role="listbox"
              class="oterm-scroll absolute inset-x-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] py-1 shadow-lg"
              @mousedown.stop
            >
              <button
                v-if="extraSource"
                type="button"
                role="option"
                :aria-selected="source === extraSource.value"
                :class="[
                  optionClass,
                  source === extraSource.value
                    ? 'bg-[var(--oterm-accent-dim)] text-[var(--oterm-accent)]'
                    : 'text-[var(--oterm-text)]',
                ]"
                @click="selectSource(extraSource.value)"
              >
                <span class="truncate">{{ extraSource.label }}</span>
              </button>

              <template v-if="localBranches.length">
                <p
                  class="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--oterm-faint)]"
                >
                  Local
                </p>
                <button
                  v-for="branch in localBranches"
                  :key="branch.name"
                  type="button"
                  role="option"
                  :aria-selected="source === branch.name"
                  :class="[
                    optionClass,
                    source === branch.name
                      ? 'bg-[var(--oterm-accent-dim)] text-[var(--oterm-accent)]'
                      : 'text-[var(--oterm-text)]',
                  ]"
                  @click="selectSource(branch.name)"
                >
                  <span class="truncate">
                    {{ branch.name }}{{ branch.isCurrent ? " (current)" : "" }}
                  </span>
                </button>
              </template>

              <template v-if="remoteBranches.length">
                <p
                  class="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--oterm-faint)]"
                  :class="localBranches.length || extraSource ? 'mt-1 border-t border-[var(--oterm-border)]/60 pt-2' : ''"
                >
                  Remote
                </p>
                <button
                  v-for="branch in remoteBranches"
                  :key="branch.name"
                  type="button"
                  role="option"
                  :aria-selected="source === branch.name"
                  :class="[
                    optionClass,
                    source === branch.name
                      ? 'bg-[var(--oterm-accent-dim)] text-[var(--oterm-accent)]'
                      : 'text-[var(--oterm-text)]',
                  ]"
                  @click="selectSource(branch.name)"
                >
                  <span class="truncate">{{ branch.name }}</span>
                </button>
              </template>
            </div>
          </div>
        </label>
      </div>

      <div class="relative z-0 flex justify-end gap-2 border-t border-[var(--oterm-border)] px-5 py-4">
        <button
          type="button"
          class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs text-[var(--oterm-text)] transition hover:bg-white/5"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="rounded-md bg-[var(--oterm-accent)]/15 px-3 py-1.5 text-xs font-medium text-[var(--oterm-accent)] transition hover:bg-[var(--oterm-accent)]/25 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="submitDisabled || !name.trim() || !source.trim()"
        >
          Create
        </button>
      </div>
    </form>
  </div>
</template>
