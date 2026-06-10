<script setup lang="ts">
import { computed, ref } from "vue";
import {
  childGroups,
  collectAllTags,
  endpointsInGroup,
} from "../../lib/sshSftpStore";
import { endpointDisplayLabel, type SshEndpoint, type SshGroup, type SshSftpLibrary } from "../../types/sshSftp";

const props = defineProps<{
  library: SshSftpLibrary;
  selectedGroupId: string | "all" | "uncategorized";
  selectedTagFilters: string[];
  selectedEndpointId: string | null;
  search: string;
}>();

const emit = defineEmits<{
  "update:search": [value: string];
  "update:selectedGroupId": [value: string | "all" | "uncategorized"];
  "update:selectedTagFilters": [value: string[]];
  selectEndpoint: [endpoint: SshEndpoint];
  addGroup: [];
  addHost: [];
  exportLibrary: [];
  importLibrary: [];
}>();

const collapsedGroups = ref<Set<string>>(new Set());

const allTags = computed(() => collectAllTags(props.library));

const filteredEndpoints = computed(() => {
  let rows = props.library.endpoints;
  if (props.selectedGroupId === "uncategorized") {
    rows = rows.filter((e) => !e.groupId);
  } else if (props.selectedGroupId !== "all") {
    rows = rows.filter((e) => e.groupId === props.selectedGroupId);
  }
  if (props.selectedTagFilters.length) {
    rows = rows.filter((e) =>
      props.selectedTagFilters.some((tag) => e.tags.includes(tag)),
    );
  }
  const q = props.search.trim().toLowerCase();
  if (!q) {
    return [...rows].sort((a, b) =>
      endpointDisplayLabel(a).localeCompare(endpointDisplayLabel(b)),
    );
  }
  return rows
    .filter(
      (e) =>
        endpointDisplayLabel(e).toLowerCase().includes(q) ||
        e.host.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) ||
        e.tags.some((tag) => tag.toLowerCase().includes(q)),
    )
    .sort((a, b) => endpointDisplayLabel(a).localeCompare(endpointDisplayLabel(b)));
});

function toggleTag(tag: string) {
  const next = new Set(props.selectedTagFilters);
  if (next.has(tag)) next.delete(tag);
  else next.add(tag);
  emit("update:selectedTagFilters", [...next]);
}

function toggleGroupCollapse(groupId: string) {
  const next = new Set(collapsedGroups.value);
  if (next.has(groupId)) next.delete(groupId);
  else next.add(groupId);
  collapsedGroups.value = next;
}

function endpointSubtitle(endpoint: SshEndpoint) {
  return `${endpoint.username}@${endpoint.host}:${endpoint.port}`;
}

function rowClass(endpoint: SshEndpoint) {
  return props.selectedEndpointId === endpoint.id
    ? "border-[var(--oterm-accent)]/50 bg-[var(--oterm-accent)]/5"
    : "border-[var(--oterm-border)] bg-[var(--oterm-panel)]";
}

function renderGroups(parentId: string | null, depth = 0): Array<{ group: SshGroup; depth: number }> {
  const rows: Array<{ group: SshGroup; depth: number }> = [];
  for (const group of childGroups(props.library.groups, parentId)) {
    rows.push({ group, depth });
    if (!collapsedGroups.value.has(group.id)) {
      rows.push(...renderGroups(group.id, depth + 1));
    }
  }
  return rows;
}

const groupRows = computed(() => renderGroups(null));
</script>

<template>
  <aside class="flex min-h-0 flex-col border-r border-[var(--oterm-border)]">
    <div class="space-y-2 border-b border-[var(--oterm-border)] p-3">
      <input
        :value="search"
        type="search"
        placeholder="Search hosts..."
        class="w-full rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm outline-none focus:border-[var(--oterm-accent)]/50"
        @input="emit('update:search', ($event.target as HTMLInputElement).value)"
      />
      <div class="flex flex-wrap gap-1">
        <button
          type="button"
          class="rounded border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5"
          @click="emit('addGroup')"
        >
          Group
        </button>
        <button
          type="button"
          class="rounded border border-[var(--oterm-accent)]/40 px-2 py-1 text-xs text-[var(--oterm-accent)] hover:bg-[var(--oterm-accent)]/10"
          @click="emit('addHost')"
        >
          Host
        </button>
        <button
          type="button"
          class="rounded border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5"
          @click="emit('exportLibrary')"
        >
          Export
        </button>
        <button
          type="button"
          class="rounded border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5"
          @click="emit('importLibrary')"
        >
          Import
        </button>
      </div>
      <div v-if="allTags.length" class="flex flex-wrap gap-1">
        <button
          v-for="tag in allTags"
          :key="tag"
          type="button"
          class="rounded-full border px-2 py-0.5 text-[10px]"
          :class="
            selectedTagFilters.includes(tag)
              ? 'border-[var(--oterm-accent)]/50 bg-[var(--oterm-accent)]/10 text-[var(--oterm-accent)]'
              : 'border-[var(--oterm-border)] text-[var(--oterm-muted)] hover:bg-white/5'
          "
          @click="toggleTag(tag)"
        >
          {{ tag }}
        </button>
      </div>
    </div>

    <div class="oterm-scroll min-h-0 flex-1 overflow-auto p-2">
      <button
        type="button"
        class="mb-1 w-full rounded px-2 py-1 text-left text-xs"
        :class="
          selectedGroupId === 'all'
            ? 'bg-[var(--oterm-accent)]/10 text-[var(--oterm-accent)]'
            : 'text-[var(--oterm-muted)] hover:bg-white/5'
        "
        @click="emit('update:selectedGroupId', 'all')"
      >
        All hosts ({{ library.endpoints.length }})
      </button>
      <button
        type="button"
        class="mb-2 w-full rounded px-2 py-1 text-left text-xs"
        :class="
          selectedGroupId === 'uncategorized'
            ? 'bg-[var(--oterm-accent)]/10 text-[var(--oterm-accent)]'
            : 'text-[var(--oterm-muted)] hover:bg-white/5'
        "
        @click="emit('update:selectedGroupId', 'uncategorized')"
      >
        Uncategorized ({{ endpointsInGroup(library.endpoints, null).length }})
      </button>

      <div v-for="{ group, depth } in groupRows" :key="group.id" class="mb-1">
        <button
          type="button"
          class="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-xs font-medium"
          :style="{ paddingLeft: `${8 + depth * 12}px` }"
          :class="
            selectedGroupId === group.id
              ? 'bg-[var(--oterm-accent)]/10 text-[var(--oterm-accent)]'
              : 'text-[var(--oterm-muted)] hover:bg-white/5'
          "
          @click="emit('update:selectedGroupId', group.id)"
        >
          <span
            v-if="childGroups(library.groups, group.id).length"
            class="inline-block w-3 text-[10px]"
            @click.stop="toggleGroupCollapse(group.id)"
          >
            {{ collapsedGroups.has(group.id) ? "▸" : "▾" }}
          </span>
          <span v-else class="inline-block w-3" />
          {{ group.name }}
          ({{ endpointsInGroup(library.endpoints, group.id).length }})
        </button>
      </div>

      <div class="mt-3 space-y-1">
        <button
          v-for="endpoint in filteredEndpoints"
          :key="endpoint.id"
          type="button"
          class="w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.02]"
          :class="rowClass(endpoint)"
          @click="emit('selectEndpoint', endpoint)"
        >
          <div class="truncate font-medium">{{ endpointDisplayLabel(endpoint) }}</div>
          <div class="mt-0.5 truncate text-[10px] text-[var(--oterm-muted)]">
            {{ endpointSubtitle(endpoint) }}
          </div>
          <div v-if="endpoint.tags.length" class="mt-1 flex flex-wrap gap-1">
            <span
              v-for="tag in endpoint.tags"
              :key="tag"
              class="rounded-full border border-[var(--oterm-border)] px-1.5 py-0 text-[9px] text-[var(--oterm-muted)]"
            >
              {{ tag }}
            </span>
          </div>
        </button>
        <p v-if="filteredEndpoints.length === 0" class="px-2 py-4 text-xs text-[var(--oterm-muted)]">
          No hosts in this view.
        </p>
      </div>
    </div>
  </aside>
</template>
