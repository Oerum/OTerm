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
  <div class="no-drag flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--oterm-border)] px-4 py-3">
    <div class="min-w-0">
      <div class="truncate text-sm font-medium">{{ endpointDisplayLabel(endpoint) }}</div>
      <div class="truncate text-xs text-[var(--oterm-muted)]">{{ endpointSubtitle(endpoint) }}</div>
      <div v-if="endpoint.tags.length" class="mt-1 flex flex-wrap gap-1">
        <span
          v-for="tag in endpoint.tags"
          :key="tag"
          class="rounded-full border border-[var(--oterm-border)] px-1.5 py-0 text-[9px] text-[var(--oterm-muted)]"
        >
          {{ tag }}
        </span>
      </div>
    </div>
    <div class="flex-1" />
    <button
      type="button"
      class="rounded border border-[var(--oterm-accent)]/40 px-2 py-1 text-xs text-[var(--oterm-accent)] hover:bg-[var(--oterm-accent)]/10 disabled:opacity-50"
      :disabled="busy"
      @click="emit('openTerminal')"
    >
      {{ endpoint.connectionType === "mosh" ? "Mosh terminal" : "SSH terminal" }}
    </button>
    <button
      v-if="!sftpConnected"
      type="button"
      class="rounded border border-[var(--oterm-accent)]/40 px-2 py-1 text-xs text-[var(--oterm-accent)] hover:bg-[var(--oterm-accent)]/10 disabled:opacity-50"
      :disabled="busy"
      @click="emit('connectSftp')"
    >
      Connect SFTP
    </button>
    <button
      v-else
      type="button"
      class="rounded border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-50"
      :disabled="busy"
      @click="emit('disconnectSftp')"
    >
      Disconnect
    </button>
    <button
      type="button"
      class="rounded border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5"
      @click="emit('edit')"
    >
      Edit
    </button>
    <button
      type="button"
      class="rounded border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5"
      @click="emit('duplicate')"
    >
      Duplicate
    </button>
    <button
      type="button"
      class="rounded border border-[var(--oterm-danger)]/40 px-2 py-1 text-xs text-[var(--oterm-danger)] hover:bg-[var(--oterm-danger)]/10"
      @click="emit('remove')"
    >
      Delete
    </button>
  </div>
</template>
