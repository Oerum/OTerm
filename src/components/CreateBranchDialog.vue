<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import type { BranchRefInfo } from "../types/branchManager";

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

const localBranches = computed(() => props.branches.filter((b) => !b.isRemote));
const remoteBranches = computed(() => props.branches.filter((b) => b.isRemote));

const hasSourceOptions = computed(
  () =>
    localBranches.value.length > 0 ||
    remoteBranches.value.length > 0 ||
    !!props.extraSource,
);

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("cancel");
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      window.addEventListener("keydown", onKeyDown);
      await nextTick();
      inputRef.value?.focus();
      inputRef.value?.select();
    } else {
      window.removeEventListener("keydown", onKeyDown);
    }
  },
  { immediate: true },
);

onUnmounted(() => window.removeEventListener("keydown", onKeyDown));
</script>

<template>
  <div
    v-if="open"
    class="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
    @click.self="emit('cancel')"
  >
    <form
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-branch-dialog-title"
      class="w-full max-w-sm overflow-hidden rounded-xl border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] shadow-2xl"
      @submit.prevent="emit('confirm')"
      @mousedown.stop
    >
      <div class="border-b border-[var(--oterm-border)] px-4 py-3">
        <h2 id="create-branch-dialog-title" class="text-sm font-medium text-[var(--oterm-text)]">
          Create branch
        </h2>
      </div>

      <div class="grid gap-3 px-4 py-3">
        <p v-if="error" class="text-xs text-[var(--oterm-danger)]">{{ error }}</p>
        <label class="grid gap-1.5 text-xs text-[var(--oterm-muted)]">
          Branch name
          <input
            ref="inputRef"
            :value="name"
            type="text"
            placeholder="feature/my-branch"
            class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2.5 py-1.5 text-sm text-[var(--oterm-text)] outline-none transition focus:border-[var(--oterm-accent)]/50"
            @input="emit('update:name', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label class="grid gap-1.5 text-xs text-[var(--oterm-muted)]">
          Source
          <select
            :value="source"
            class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2.5 py-1.5 text-sm text-[var(--oterm-text)] outline-none transition focus:border-[var(--oterm-accent)]/50 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!hasSourceOptions"
            @change="emit('update:source', ($event.target as HTMLSelectElement).value)"
          >
            <option v-if="!hasSourceOptions" value="" disabled>No branches available</option>
            <option v-if="extraSource" :value="extraSource.value">
              {{ extraSource.label }}
            </option>
            <optgroup v-if="localBranches.length" label="Local">
              <option v-for="branch in localBranches" :key="branch.name" :value="branch.name">
                {{ branch.name }}{{ branch.isCurrent ? " (current)" : "" }}
              </option>
            </optgroup>
            <optgroup v-if="remoteBranches.length" label="Remote">
              <option v-for="branch in remoteBranches" :key="branch.name" :value="branch.name">
                {{ branch.name }}
              </option>
            </optgroup>
          </select>
        </label>
      </div>

      <div class="flex justify-end gap-2 border-t border-[var(--oterm-border)] px-4 py-3">
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
