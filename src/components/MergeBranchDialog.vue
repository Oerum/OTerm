<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import type { BranchRefInfo } from "../types/branchManager";
import { canMergeBranchLocally, localBranchName } from "../lib/branchGrouping";

const props = withDefaults(
  defineProps<{
    open: boolean;
    source: BranchRefInfo | null;
    targetBranches: string[];
    defaultTarget: string;
    prAvailable: boolean;
    busy?: boolean;
    error?: string | null;
  }>(),
  {
    busy: false,
    error: null,
  },
);

const emit = defineEmits<{
  "update:target": [value: string];
  mergeLocally: [];
  createPr: [];
  cancel: [];
}>();

const target = ref("");
const selectRef = ref<HTMLSelectElement | null>(null);

const sourceLabel = computed(() => props.source?.name ?? "");
const sourceLocalName = computed(() =>
  props.source ? localBranchName(props.source) : null,
);
const canMergeLocally = computed(() =>
  props.source ? canMergeBranchLocally(props.source, props.targetBranches) : false,
);
const canCreatePr = computed(
  () => props.prAvailable && !!sourceLocalName.value && !!target.value,
);
const compareLabel = computed(() => {
  const head = sourceLocalName.value ?? "source";
  const base = target.value || "target";
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
      target.value = props.defaultTarget;
      window.addEventListener("keydown", onKeyDown);
      await nextTick();
      selectRef.value?.focus();
    } else {
      window.removeEventListener("keydown", onKeyDown);
    }
  },
  { immediate: true },
);

watch(target, (value) => emit("update:target", value));

onUnmounted(() => window.removeEventListener("keydown", onKeyDown));
</script>

<template>
  <div
    v-if="open"
    class="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
    @click.self="emit('cancel')"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-branch-dialog-title"
      class="w-full max-w-md overflow-hidden rounded-xl border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] shadow-2xl"
      @mousedown.stop
    >
      <div class="border-b border-[var(--oterm-border)] px-4 py-3">
        <h2 id="merge-branch-dialog-title" class="text-sm font-medium text-[var(--oterm-text)]">
          Merge branch
        </h2>
        <p class="mt-1 text-xs text-[var(--oterm-muted)]">
          Merge <span class="text-[var(--oterm-text)]">{{ sourceLabel }}</span> into another branch
        </p>
      </div>

      <div class="grid gap-3 px-4 py-3">
        <p v-if="error" class="text-xs text-[var(--oterm-danger)]">{{ error }}</p>

        <label class="grid gap-1.5 text-xs text-[var(--oterm-muted)]">
          Into (target)
          <select
            ref="selectRef"
            v-model="target"
            class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2.5 py-1.5 text-sm text-[var(--oterm-text)] outline-none transition focus:border-[var(--oterm-accent)]/50 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="busy || targetBranches.length === 0"
          >
            <option v-if="targetBranches.length === 0" value="" disabled>No branches</option>
            <option v-for="branch in targetBranches" :key="branch" :value="branch">
              {{ branch }}
            </option>
          </select>
        </label>

        <p v-if="!canMergeLocally" class="text-xs text-[var(--oterm-muted)]">
          Switch or create a local tracking branch for this remote ref before merging or opening a
          pull request.
        </p>

        <p v-else class="text-xs text-[var(--oterm-faint)]">{{ compareLabel }}</p>
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
          type="button"
          class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs text-[var(--oterm-text)] transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="busy || !canMergeLocally || !target || target === sourceLocalName"
          @click="emit('mergeLocally')"
        >
          {{ busy ? "Merging…" : "Merge locally" }}
        </button>
        <button
          type="button"
          class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs text-[var(--oterm-text)] transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="busy || !canCreatePr || target === sourceLocalName"
          @click="emit('createPr')"
        >
          Create PR
        </button>
      </div>
    </div>
  </div>
</template>
