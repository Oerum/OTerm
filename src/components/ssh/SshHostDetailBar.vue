<script setup lang="ts">
import { endpointDisplayLabel, type SshEndpoint } from "../../types/sshSftp";

defineProps<{
  endpoint: SshEndpoint;
  sftpConnected: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  connectSftp: [];
  disconnectSftp: [];
  openTerminal: [];
  edit: [];
  duplicate: [];
  remove: [];
}>();

function endpointSubtitle(endpoint: SshEndpoint) {
  return `${endpoint.username}@${endpoint.host}:${endpoint.port}`;
}
</script>

<template>
  <div class="no-drag flex shrink-0 flex-wrap items-center gap-4 border-b border-[var(--oterm-border)] px-6 py-4 bg-[var(--oterm-panel)]/30">
    <!-- Server profile card -->
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <h3 class="text-sm font-bold text-white truncate">{{ endpointDisplayLabel(endpoint) }}</h3>
        <!-- Active connection type badge -->
        <span class="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider bg-white/5 text-[var(--oterm-faint)] border border-white/10">
          {{ endpoint.connectionType }}
        </span>
        <!-- Connection Status Badge -->
        <span 
          class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold border"
          :class="sftpConnected ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-[var(--oterm-muted)] border-white/10'"
        >
          <span class="h-1.5 w-1.5 rounded-full" :class="sftpConnected ? 'bg-emerald-400 animate-pulse' : 'bg-[var(--oterm-faint)]'" />
          {{ sftpConnected ? 'SFTP Online' : 'SFTP Offline' }}
        </span>
      </div>
      <div class="truncate text-xs text-[var(--oterm-muted)] font-mono mt-1 flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-55">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
          <line x1="7" y1="2" x2="7" y2="22"/>
        </svg>
        {{ endpointSubtitle(endpoint) }}
      </div>
      <div v-if="endpoint.tags.length" class="mt-2 flex flex-wrap gap-1">
        <span
          v-for="tag in endpoint.tags"
          :key="tag"
          class="rounded-full border border-[var(--oterm-border)] px-2 py-0.5 text-[8px] font-bold text-[var(--oterm-faint)] bg-white/2"
        >
          #{{ tag }}
        </span>
      </div>
    </div>
    
    <div class="flex-1" />
    
    <!-- Actions Bar toolbar -->
    <div class="flex items-center gap-2">
      <!-- Terminal Button -->
      <button
        type="button"
        class="action-btn action-btn--accent"
        :disabled="busy"
        @click="emit('openTerminal')"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        {{ endpoint.connectionType === "mosh" ? "Mosh Terminal" : "SSH Terminal" }}
      </button>

      <!-- Connect SFTP Button -->
      <button
        v-if="!sftpConnected"
        type="button"
        class="action-btn action-btn--accent"
        :disabled="busy"
        @click="emit('connectSftp')"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        Connect SFTP
      </button>
      <button
        v-else
        type="button"
        class="action-btn"
        :disabled="busy"
        @click="emit('disconnectSftp')"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2"/>
        </svg>
        Disconnect SFTP
      </button>

      <div class="h-4 w-[1px] bg-[var(--oterm-border)] mx-1" />

      <!-- Edit details -->
      <button
        type="button"
        class="action-btn"
        title="Edit host profile"
        @click="emit('edit')"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Edit
      </button>

      <!-- Duplicate profile -->
      <button
        type="button"
        class="action-btn"
        title="Duplicate host profile"
        @click="emit('duplicate')"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        Clone
      </button>

      <!-- Delete profile -->
      <button
        type="button"
        class="action-btn action-btn--danger"
        title="Delete host profile"
        @click="emit('remove')"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
        Delete
      </button>
    </div>
  </div>
</template>

<style scoped>
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 11px;
  font-family: var(--oterm-font-ui);
  font-weight: 600;
  color: var(--oterm-muted);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--oterm-border);
  cursor: pointer;
  transition: all 150ms ease;
}

.action-btn:hover:not(:disabled) {
  color: var(--oterm-text);
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--oterm-border-strong);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn--accent {
  color: var(--oterm-accent);
  border-color: rgba(0, 229, 186, 0.2);
}

.action-btn--accent:hover:not(:disabled) {
  background: rgba(0, 229, 186, 0.08);
  border-color: rgba(0, 229, 186, 0.4);
}

.action-btn--danger {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.2);
}

.action-btn--danger:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.08);
  border-color: rgba(248, 113, 113, 0.4);
  color: #fca5a5;
}
</style>
