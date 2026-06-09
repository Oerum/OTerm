<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import type { GitBranchList } from "../types/git";

const props = withDefaults(
  defineProps<{
    open: boolean;
    branches: GitBranchList;
    title: string;
    body: string;
    base: string;
    head: string;
    draft: boolean;
    busy?: boolean;
    error?: string | null;
  }>(),
  {
    busy: false,
    error: null,
  },
);

const emit = defineEmits<{
  "update:title": [value: string];
  "update:body": [value: string];
  "update:base": [value: string];
  "update:head": [value: string];
  "update:draft": [value: boolean];
  confirm: [];
  cancel: [];
}>();

const titleRef = ref<HTMLInputElement | null>(null);

const localBranches = computed(() => props.branches.local);
const hasBranches = computed(() => localBranches.value.length > 0);

const compareLabel = computed(() => {
  const head = props.head.trim() || "compare";
  const base = props.base.trim() || "base";
  return `${head} → ${base}`;
});

function onKeyDown(event: KeyboardEvent) {
  if (!props.open) return;
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
      titleRef.value?.focus();
      titleRef.value?.select();
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
      aria-labelledby="create-pr-dialog-title"
      class="w-full max-w-md overflow-hidden rounded-xl border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] shadow-2xl"
      @submit.prevent="emit('confirm')"
      @mousedown.stop
    >
      <div class="border-b border-[var(--oterm-border)] px-4 py-3">
        <h2 id="create-pr-dialog-title" class="text-sm font-medium text-[var(--oterm-text)]">
          Create pull request
        </h2>
        <p class="mt-1 text-xs text-[var(--oterm-muted)]">{{ compareLabel }}</p>
      </div>

      <div class="grid gap-3 px-4 py-3">
        <p v-if="error" class="text-xs text-[var(--oterm-danger)]">{{ error }}</p>

        <div class="grid grid-cols-2 gap-3">
          <label class="grid gap-1.5 text-xs text-[var(--oterm-muted)]">
            Compare (head)
            <select
              :value="head"
              class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2.5 py-1.5 text-sm text-[var(--oterm-text)] outline-none transition focus:border-[var(--oterm-accent)]/50 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!hasBranches || busy"
              @change="emit('update:head', ($event.target as HTMLSelectElement).value)"
            >
              <option v-if="!hasBranches" value="" disabled>No branches</option>
              <option v-for="branch in localBranches" :key="branch" :value="branch">
                {{ branch }}{{ branches.current === branch ? " (current)" : "" }}
              </option>
            </select>
          </label>

          <label class="grid gap-1.5 text-xs text-[var(--oterm-muted)]">
            Base
            <select
              :value="base"
              class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2.5 py-1.5 text-sm text-[var(--oterm-text)] outline-none transition focus:border-[var(--oterm-accent)]/50 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!hasBranches || busy"
              @change="emit('update:base', ($event.target as HTMLSelectElement).value)"
            >
              <option v-if="!hasBranches" value="" disabled>No branches</option>
              <option v-for="branch in localBranches" :key="branch" :value="branch">
                {{ branch }}
              </option>
            </select>
          </label>
        </div>

        <label class="grid gap-1.5 text-xs text-[var(--oterm-muted)]">
          Title
          <input
            ref="titleRef"
            :value="title"
            type="text"
            placeholder="PR title"
            class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2.5 py-1.5 text-sm text-[var(--oterm-text)] outline-none transition focus:border-[var(--oterm-accent)]/50"
            :disabled="busy"
            @input="emit('update:title', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label class="grid gap-1.5 text-xs text-[var(--oterm-muted)]">
          Description
          <textarea
            :value="body"
            rows="4"
            placeholder="What does this change do?"
            class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2.5 py-1.5 text-sm text-[var(--oterm-text)] outline-none transition focus:border-[var(--oterm-accent)]/50"
            :disabled="busy"
            @input="emit('update:body', ($event.target as HTMLTextAreaElement).value)"
          />
        </label>

        <label class="flex items-center gap-2 text-xs text-[var(--oterm-muted)]">
          <input
            :checked="draft"
            type="checkbox"
            class="accent-[var(--oterm-accent)]"
            :disabled="busy"
            @change="emit('update:draft', ($event.target as HTMLInputElement).checked)"
          />
          Create as draft
        </label>
      </div>

      <div class="flex justify-end gap-2 border-t border-[var(--oterm-border)] px-4 py-3">
        <button
          type="button"
          class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs text-[var(--oterm-text)] transition hover:bg-white/5"
          :disabled="busy"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="rounded-md bg-[var(--oterm-accent)] px-3 py-1.5 text-xs text-black disabled:opacity-50"
          :disabled="busy || !title.trim() || !base || !head || base === head"
        >
          {{ busy ? "Creating…" : "Create PR" }}
        </button>
      </div>
    </form>
  </div>
</template>
