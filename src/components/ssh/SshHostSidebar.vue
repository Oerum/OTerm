<script setup lang="ts">
import { computed, ref } from "vue";
import {
  childGroups,
  collectAllTags,
  endpointsInGroup,
} from "../../lib/sshSftpStore";
import { endpointDisplayLabel, type SshEndpoint, type SshGroup, type SshSftpLibrary } from "../../types/sshSftp";
import UiGlyph from "../UiGlyph.vue";

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
  openTerminalDirectly: [endpoint: SshEndpoint];
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
  const isSelected = props.selectedEndpointId === endpoint.id;
  if (isSelected) {
    return "border-[var(--oterm-accent)] bg-[var(--oterm-accent-dim)]/10 shadow-[0_0_10px_rgba(0,229,186,0.03)] scale-[1.01] z-10 text-white";
  }
  return "border-[var(--oterm-border)] bg-[var(--oterm-panel)]/30 hover:bg-[var(--oterm-panel)]/80 hover:border-[var(--oterm-border-strong)] hover:scale-[1.005]";
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
  <aside class="flex min-h-0 flex-col border-r border-[var(--oterm-border)] bg-[var(--oterm-panel)]/30">
    <!-- Search and Actions Bar -->
    <div class="space-y-3 border-b border-[var(--oterm-border)] p-4 bg-[var(--oterm-panel)]/60">
      <div class="relative">
        <span class="absolute inset-y-0 left-0 flex items-center pl-2.5 text-[var(--oterm-faint)]">
          <UiGlyph name="search" :size="13" />
        </span>
        <input
          :value="search"
          type="search"
          placeholder="Search hosts..."
          class="w-full rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-bg)]/60 py-1.5 pl-8 pr-3 text-xs text-white placeholder-[var(--oterm-faint)] outline-none focus:border-[var(--oterm-accent)]/40 focus:ring-1 focus:ring-[var(--oterm-accent)]/15 transition duration-150"
          @input="emit('update:search', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <!-- Action Tools -->
      <div class="flex flex-wrap gap-1.5">
        <button
          type="button"
          class="header-tool-btn"
          title="Add Group folder"
          @click="emit('addGroup')"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Group
        </button>
        <button
          type="button"
          class="header-tool-btn header-tool-btn--accent"
          title="Add SSH/Mosh host"
          @click="emit('addHost')"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Host
        </button>
        <div class="flex-1" />
        <button
          type="button"
          class="header-tool-btn"
          title="Export hosts"
          @click="emit('exportLibrary')"
        >
          Export
        </button>
        <button
          type="button"
          class="header-tool-btn"
          title="Import hosts file"
          @click="emit('importLibrary')"
        >
          Import
        </button>
      </div>

      <!-- Tags Filters -->
      <div v-if="allTags.length" class="flex flex-wrap gap-1 border-t border-[var(--oterm-border)]/50 pt-2">
        <button
          v-for="tag in allTags"
          :key="tag"
          type="button"
          class="rounded-full border px-2 py-0.5 text-[9px] font-semibold transition"
          :class="
            selectedTagFilters.includes(tag)
              ? 'border-[var(--oterm-accent)]/55 bg-[var(--oterm-accent-dim)]/10 text-[var(--oterm-accent)]'
              : 'border-[var(--oterm-border)] text-[var(--oterm-muted)] hover:text-white hover:bg-white/5'
          "
          @click="toggleTag(tag)"
        >
          #{{ tag }}
        </button>
      </div>
    </div>

    <!-- Hosts and Categories List -->
    <div class="oterm-scroll min-h-0 flex-1 overflow-auto p-3 space-y-3">
      
      <!-- Group categories -->
      <div class="space-y-1">
        <button
          type="button"
          class="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold"
          :class="
            selectedGroupId === 'all'
              ? 'bg-[var(--oterm-accent)]/10 text-[var(--oterm-accent)]'
              : 'text-[var(--oterm-muted)] hover:text-white hover:bg-white/5'
          "
          @click="emit('update:selectedGroupId', 'all')"
        >
          <span class="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
              <line x1="7" y1="2" x2="7" y2="22"/>
            </svg>
            All Connections
          </span>
          <span class="font-mono text-[10px] opacity-75">({{ library.endpoints.length }})</span>
        </button>
        <button
          type="button"
          class="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold"
          :class="
            selectedGroupId === 'uncategorized'
              ? 'bg-[var(--oterm-accent)]/10 text-[var(--oterm-accent)]'
              : 'text-[var(--oterm-muted)] hover:text-white hover:bg-white/5'
          "
          @click="emit('update:selectedGroupId', 'uncategorized')"
        >
          <span class="flex items-center gap-1.5">
            <UiGlyph name="alert" :size="12" />
            Uncategorized
          </span>
          <span class="font-mono text-[10px] opacity-75">({{ endpointsInGroup(library.endpoints, null).length }})</span>
        </button>

        <!-- Nested Groups rendering -->
        <div v-for="{ group, depth } in groupRows" :key="group.id">
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold"
            :style="{ paddingLeft: `${8 + depth * 12}px` }"
            :class="
              selectedGroupId === group.id
                ? 'bg-[var(--oterm-accent)]/10 text-[var(--oterm-accent)]'
                : 'text-[var(--oterm-muted)] hover:text-white hover:bg-white/5'
            "
            @click="emit('update:selectedGroupId', group.id)"
          >
            <span class="flex items-center gap-1.5 min-w-0 flex-1">
              <span
                v-if="childGroups(library.groups, group.id).length"
                class="text-[10px] flex items-center justify-center w-3 h-3 hover:bg-white/10 rounded"
                @click.stop="toggleGroupCollapse(group.id)"
              >
                {{ collapsedGroups.has(group.id) ? "▸" : "▾" }}
              </span>
              <span v-else class="w-3 shrink-0" />
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" class="text-amber-500 shrink-0">
                <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
              </svg>
              <span class="truncate">{{ group.name }}</span>
            </span>
            <span class="font-mono text-[10px] opacity-75 shrink-0 ml-1">({{ endpointsInGroup(library.endpoints, group.id).length }})</span>
          </button>
        </div>
      </div>

      <!-- Endpoints Hosts List -->
      <div class="space-y-1.5 border-t border-[var(--oterm-border)] pt-3">
        <div class="text-[9px] font-bold uppercase tracking-wider text-[var(--oterm-faint)] px-1 mb-2">Saved Hosts</div>
        <div
          v-for="endpoint in filteredEndpoints"
          :key="endpoint.id"
          class="sidebar-host-card w-full flex items-center justify-between rounded-xl border p-3 text-left text-sm cursor-pointer transition-all duration-150"
          :class="rowClass(endpoint)"
          @click="emit('selectEndpoint', endpoint)"
        >
          <div class="min-w-0 flex-1 flex gap-2.5 items-center">
            <!-- Server Icon with connection type color dots -->
            <div class="h-8 w-8 rounded-lg bg-white/3 flex items-center justify-center shrink-0 border border-white/5 relative">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-[var(--oterm-muted)]">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                <line x1="6" y1="6" x2="6.01" y2="6"/>
                <line x1="6" y1="18" x2="6.01" y2="18"/>
              </svg>
              <!-- Protocol Indicator Dot -->
              <span 
                class="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-[var(--oterm-panel)]"
                :class="endpoint.connectionType === 'mosh' ? 'bg-amber-500' : 'bg-emerald-500'"
                :title="endpoint.connectionType === 'mosh' ? 'Mosh Protocol' : 'SSH Protocol'"
              />
            </div>
            
            <div class="min-w-0">
              <div class="truncate font-semibold text-white">{{ endpointDisplayLabel(endpoint) }}</div>
              <div class="truncate text-[10px] text-[var(--oterm-muted)] font-mono mt-0.5">
                {{ endpointSubtitle(endpoint) }}
              </div>
              <div v-if="endpoint.tags.length" class="mt-1.5 flex flex-wrap gap-1">
                <span
                  v-for="tag in endpoint.tags"
                  :key="tag"
                  class="rounded-full border border-[var(--oterm-border)] px-1.5 py-0 text-[8px] font-semibold text-[var(--oterm-faint)]"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>

          <!-- Quick Terminal Trigger Button -->
          <button
            type="button"
            class="h-6 w-6 rounded-md hover:bg-white/5 flex items-center justify-center text-[var(--oterm-muted)] hover:text-[var(--oterm-accent)] transition shrink-0 ml-2"
            title="Launch Terminal Session directly"
            @click.stop="emit('openTerminalDirectly', endpoint)"
          >
            <UiGlyph name="terminal" :size="12" />
          </button>
        </div>
        <p v-if="filteredEndpoints.length === 0" class="py-8 text-center text-xs text-[var(--oterm-faint)]">
          No hosts found matching query.
        </p>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-host-card {
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
