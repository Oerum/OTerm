<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'

const emit = defineEmits<{
  (e: "close"): void;
}>();

const props = defineProps<{
  repoRoot: string | null;
}>()

interface StashEntry {
  index: number
  message: string
  branch: string
  date: string
}

const stashes = ref<StashEntry[]>([])
const newStashMessage = ref('')
const loading = ref(false)

const loadStashes = async () => {
  loading.value = true
  try {
    if (!props.repoRoot) return
    stashes.value = await invoke('git_stash_list_cmd', { repo_root: props.repoRoot })
  } catch (error) {
    console.error('Failed to load stashes:', error)
  } finally {
    loading.value = false
  }
}

const createStash = async () => {
  try {
    if (!props.repoRoot) return
    await invoke('git_stash_save_cmd', { 
      repo_root: props.repoRoot, 
      message: newStashMessage.value,
      include_untracked: false
    })
    newStashMessage.value = ''
    await loadStashes()
  } catch (error) {
    console.error('Failed to create stash:', error)
  }
}

const applyStash = async (index: number) => {
  try {
    if (!props.repoRoot) return
    await invoke('git_stash_apply_cmd', { repo_root: props.repoRoot, index })
  } catch (error) {
    console.error(`Failed to apply stash ${index}:`, error)
  }
}

const popStash = async (index: number) => {
  try {
    if (!props.repoRoot) return
    await invoke('git_stash_pop_cmd', { repo_root: props.repoRoot, index })
    await loadStashes()
  } catch (error) {
    console.error(`Failed to pop stash ${index}:`, error)
  }
}

const dropStash = async (index: number) => {
  try {
    if (!props.repoRoot) return
    await invoke('git_stash_drop_cmd', { repo_root: props.repoRoot, index })
    await loadStashes()
  } catch (error) {
    console.error(`Failed to drop stash ${index}:`, error)
  }
}

onMounted(() => {
  loadStashes()
})
</script>

<template>
  <div class="flex h-full flex-col bg-[var(--oterm-bg)] text-[var(--oterm-text)] font-sans">
    <div class="flex shrink-0 items-center justify-between border-b border-[var(--oterm-border)] px-4 py-3 bg-[var(--oterm-bg)]">
      <div class="flex items-center gap-3">
        <button 
          class="rounded-sm border border-[var(--oterm-border)] bg-transparent px-2.5 py-1 text-xs font-medium text-[var(--oterm-text)] hover:border-[var(--oterm-border-strong)] hover:bg-white/5 transition-colors"
          @click="$emit('close')"
        >
          Close
        </button>
        <h3 class="text-[13px] font-medium text-[var(--oterm-text)]">Stashes</h3>
      </div>
      <div class="flex gap-2">
        <input 
          v-model="newStashMessage" 
          placeholder="Message (optional)" 
          @keyup.enter="createStash" 
          class="bg-[var(--oterm-input-bg, #3c3c3c)] border border-transparent focus:border-[var(--oterm-focus, #007acc)] text-[var(--oterm-text)] px-2 py-1 rounded-sm text-xs outline-none transition-colors"
        />
        <button class="bg-[var(--oterm-brand, #007acc)] text-white hover:bg-[var(--oterm-brand-hover, #005f9e)] px-2 py-1 rounded-sm text-xs font-medium border border-transparent disabled:opacity-50 transition-colors" @click="createStash" :disabled="loading">Stash</button>
      </div>
    </div>
    
    <div class="flex-1 overflow-y-auto">
      <div v-if="loading" class="p-6 text-center text-xs text-[var(--oterm-text-muted)]">
        Loading stashes...
      </div>
      
      <div v-else-if="stashes.length === 0" class="p-6 text-center text-xs text-[var(--oterm-text-muted)]">
        No stashes
      </div>
      
      <div v-else class="stash-list">
        <div v-for="stash in stashes" :key="stash.index" class="stash-item">
          <div class="stash-info">
            <div class="stash-primary-info">
              <span class="stash-index">stash@{{ stash.index }}</span>
              <span class="stash-message">{{ stash.message }}</span>
            </div>
            <div class="stash-secondary-info">
              <span class="stash-branch">{{ stash.branch }}</span>
              <span class="stash-date">{{ stash.date }}</span>
            </div>
          </div>
          <div class="stash-actions">
            <button @click="applyStash(stash.index)" class="btn btn-ghost" title="Apply">Apply</button>
            <button @click="popStash(stash.index)" class="btn btn-ghost" title="Pop">Pop</button>
            <button @click="dropStash(stash.index)" class="btn btn-danger-ghost" title="Drop">Drop</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stash-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: var(--oterm-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif);
  color: var(--oterm-text, #d4d4d4);
  background: var(--oterm-bg, #1e1e1e);
  font-size: 13px;
}

.stash-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--oterm-border, #333);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--oterm-text-muted, #858585);
  letter-spacing: 0.05em;
}

.stash-creator {
  display: flex;
  gap: 8px;
}

.stash-input {
  flex: 1;
  background: var(--oterm-input-bg, #3c3c3c);
  border: 1px solid transparent;
  color: var(--oterm-text, #d4d4d4);
  padding: 4px 8px;
  border-radius: 2px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s ease;
}

.stash-input:focus {
  border-color: var(--oterm-focus, #007acc);
}

.stash-input::placeholder {
  color: var(--oterm-text-muted, #858585);
}

.stash-body {
  flex: 1;
  overflow-y: auto;
}

.loading-state, .empty-state {
  padding: 24px;
  text-align: center;
  color: var(--oterm-text-muted, #858585);
  font-size: 13px;
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 1px solid var(--oterm-border, #333);
  border-top-color: var(--oterm-text, #d4d4d4);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.stash-list {
  display: flex;
  flex-direction: column;
}

.stash-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--oterm-border, #333);
  gap: 12px;
}

.stash-item:hover {
  background: var(--oterm-list-hover, rgba(255, 255, 255, 0.05));
}

.stash-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.stash-primary-info {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.stash-secondary-info {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--oterm-text-muted, #858585);
}

.stash-index {
  font-family: var(--oterm-font-mono, monospace);
  font-size: 11px;
  color: var(--oterm-brand, #007acc);
  white-space: nowrap;
}

.stash-message {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stash-branch {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stash-date {
  white-space: nowrap;
}

.stash-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.stash-item:hover .stash-actions {
  opacity: 1;
}

.btn {
  padding: 4px 8px;
  border-radius: 2px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
  background: transparent;
  color: var(--oterm-text, #d4d4d4);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--oterm-brand, #007acc);
  color: #fff;
  border: 1px solid transparent;
}

.btn-primary:hover:not(:disabled) {
  background: var(--oterm-brand-hover, #005f9e);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--oterm-hover, rgba(255, 255, 255, 0.1));
}

.btn-danger-ghost {
  color: var(--oterm-error, #f14c4c);
}

.btn-danger-ghost:hover:not(:disabled) {
  background: var(--oterm-error-bg, rgba(241, 76, 76, 0.1));
}
</style>
