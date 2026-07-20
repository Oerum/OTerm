<template>
  <div class="terminal-sync-panel p-4 flex flex-col gap-4 h-full bg-(--oterm-bg)">
    <h2 class="text-lg font-bold text-(--oterm-text)">Terminal/GUI Sync</h2>
    
    <div class="flex flex-col gap-2">
      <label class="font-medium text-sm text-(--oterm-text)">GUI State (Input)</label>
      <input 
        v-model="inputGuiState" 
        @keyup.enter="handlePushGuiState"
        class="border border-(--oterm-border) rounded px-2 py-1.5 bg-(--oterm-bg)/60 text-xs text-(--oterm-text) outline-none focus:border-[var(--oterm-accent)]/30 focus:ring-1 focus:ring-[var(--oterm-accent)]/15 transition duration-150"
        placeholder="Enter new GUI state..."
      />
      <button 
        @click="handlePushGuiState"
        class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm w-fit font-medium transition-colors"
      >
        Update GUI State
      </button>
    </div>

    <div class="flex flex-col gap-2 mt-2">
      <h3 class="font-medium text-sm text-(--oterm-text)">Synced GUI State</h3>
      <div class="bg-[var(--oterm-panel)]/10 border border-(--oterm-border) p-3 rounded-lg min-h-[60px]">
        <pre class="text-xs whitespace-pre-wrap text-(--oterm-text)">{{ syncState.guiState || 'No state synced yet.' }}</pre>
      </div>
    </div>

    <div class="flex flex-col gap-2 mt-2 flex-1 min-h-0">
      <h3 class="font-medium text-sm text-(--oterm-text)">Terminal Output Log</h3>
      <div class="bg-[var(--oterm-panel)]/10 border border-(--oterm-border) p-3 rounded-lg flex-1 overflow-y-auto oterm-scroll">
        <pre class="text-xs whitespace-pre-wrap text-(--oterm-text) break-words">{{ syncState.output || 'No terminal output captured yet.' }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useTerminalSync } from '../composables/useTerminalSync';

const props = defineProps<{
  repoRoot: string
}>();

const { syncState, pushGuiState } = useTerminalSync(props.repoRoot);
const inputGuiState = ref('');

watch(() => syncState.value.guiState, (newVal) => {
  if (inputGuiState.value === '') {
    inputGuiState.value = newVal;
  }
});

const handlePushGuiState = () => {
  if (inputGuiState.value !== undefined) {
    pushGuiState(inputGuiState.value);
  }
};
</script>

<style scoped>
.terminal-sync-panel {
  display: flex;
  flex-direction: column;
}
</style>
