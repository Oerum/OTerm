<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type {
  CommandPaletteCategory,
  CommandPaletteItem,
} from "../lib/commandPaletteItems";
import { formatKeybind, getKeybind } from "../lib/keybindSettings";

const props = defineProps<{
  open: boolean;
  query: string;
  items: CommandPaletteItem[];
  activeIndex: number;
}>();

const emit = defineEmits<{
  "update:query": [value: string];
  close: [];
  select: [item: CommandPaletteItem];
  "move-active": [delta: number];
  "set-active": [index: number];
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const itemRefs = ref<(HTMLElement | null)[]>([]);

const localQuery = computed({
  get: () => props.query,
  set: (value: string) => emit("update:query", value),
});

const categoryLabels: Record<CommandPaletteCategory, string> = {
  actions: "Actions",
  terminals: "Terminals",
  groups: "Groups",
  settings: "Settings",
  ssh: "SSH",
  git: "Git",
  agents: "Agents",
  history: "Recent commands",
};

const paletteShortcut = computed(() => formatKeybind(getKeybind("command-palette")));

function setItemRef(index: number, el: Element | null) {
  itemRefs.value[index] = el as HTMLElement | null;
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    await nextTick();
    inputRef.value?.focus();
  },
);

watch(
  () => [props.open, props.activeIndex, props.items.length] as const,
  async ([open]) => {
    if (!open) return;
    await nextTick();
    itemRefs.value[props.activeIndex]?.scrollIntoView({ block: "nearest" });
  },
);

function showCategoryHeader(index: number): boolean {
  const item = props.items[index];
  if (!item) return false;
  return item.category !== props.items[index - 1]?.category;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    emit("move-active", 1);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    emit("move-active", -1);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const item = props.items[props.activeIndex];
    if (item) emit("select", item);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
  }
}
</script>

<template>
  <div
    v-if="open"
    class="absolute inset-0 z-40 flex items-start justify-center bg-black/55 pt-[12vh] backdrop-blur-[2px]"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] shadow-2xl"
    >
      <div class="border-b border-[var(--oterm-border)] px-4 py-3">
        <input
          ref="inputRef"
          v-model="localQuery"
          class="w-full bg-transparent text-sm text-[var(--oterm-text)] outline-none placeholder:text-[var(--oterm-faint)]"
          placeholder="Type a command…"
          @keydown="onKeydown"
        />
      </div>
      <div class="oterm-scroll max-h-80 overflow-y-auto py-1">
        <template v-for="(item, index) in items" :key="item.id">
          <div
            v-if="showCategoryHeader(index)"
            class="px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-[var(--oterm-faint)]"
          >
            {{ categoryLabels[item.category] }}
          </div>
          <button
            type="button"
            :ref="(el) => setItemRef(index, el as Element | null)"
            class="flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition"
            :class="
              index === activeIndex
                ? 'bg-[var(--oterm-accent-dim)] text-[var(--oterm-text)]'
                : 'text-[var(--oterm-muted)] hover:bg-[var(--oterm-accent-dim)] hover:text-[var(--oterm-text)]'
            "
            @mouseenter="emit('set-active', index)"
            @click="emit('select', item)"
          >            <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
            <span v-if="item.hint" class="shrink-0 text-[10px] text-[var(--oterm-faint)]">
              {{ item.hint }}
            </span>
          </button>
        </template>
        <p v-if="items.length === 0" class="px-4 py-8 text-center text-sm text-[var(--oterm-faint)]">
          No matching commands.
        </p>
      </div>
      <div
        class="flex items-center justify-between border-t border-[var(--oterm-border)] px-4 py-2 text-[10px] text-[var(--oterm-faint)]"
      >
        <span>&gt; commands · @ sessions · $ history · # agents · Enter run · Esc close</span>
        <span>{{ paletteShortcut }}</span>
      </div>
    </div>
  </div>
</template>
