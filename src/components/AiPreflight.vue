<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useCommitAiSettings } from '../lib/commitAiSettings'

const props = defineProps<{
  repoRoot: string | null
}>()

const emit = defineEmits(['close'])

const checkResults = ref<any[]>([])
const loading = ref(false)

const runPreflightChecks = async () => {
  loading.value = true
  try {
    const { settings } = useCommitAiSettings()
    
    if (!props.repoRoot) {
      throw new Error('Repository root not available')
    }

    checkResults.value = await invoke('git_ai_preflight', {
      repo_root: props.repoRoot,
      endpoint: settings.value.endpoint,
      provider: settings.value.provider,
      api_key: settings.value.apiKey || null,
      model: settings.value.model
    })
  } catch (error) {
    console.error('Failed to run AI preflight checks:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  runPreflightChecks()
})
</script>

<template>
  <div class="flex h-full flex-col bg-[var(--oterm-bg)] text-[var(--oterm-text)] font-sans">
    <div class="flex shrink-0 items-center justify-between border-b border-[var(--oterm-border)] px-4 py-3 bg-[var(--oterm-bg)]">
      <div class="flex items-center gap-3">
        <button 
          class="rounded-sm border border-[var(--oterm-border)] bg-transparent px-2.5 py-1 text-xs font-medium text-[var(--oterm-text)] hover:border-[var(--oterm-border-strong)] hover:bg-white/5 transition-colors"
          @click="emit('close')"
        >
          Close
        </button>
        <h3 class="text-[13px] font-medium text-[var(--oterm-text)]">AI Pre-flight</h3>
      </div>
    </div>
    
    <div class="flex-1 overflow-y-auto">
      <div v-if="loading" class="p-6 flex flex-col items-center justify-center gap-2 text-xs text-[var(--oterm-text-muted)]">
        <span class="spinner"></span>
        <span class="loading-text">Analyzing context...</span>
      </div>
      
      <div v-else-if="checkResults.length === 0" class="p-6 flex flex-col items-center justify-center gap-2 text-xs text-green-500">
        <span class="success-icon">✓</span>
        <span class="success-text">Ready to commit. No issues found.</span>
      </div>
      
      <div v-else class="results-list">
        <div v-for="(result, index) in checkResults" :key="index" class="result-item" :class="result.severity">
          <div class="result-icon">
            <span v-if="result.severity === 'error'" class="icon-error">!</span>
            <span v-else-if="result.severity === 'warning'" class="icon-warning">⚠</span>
            <span v-else class="icon-info">i</span>
          </div>
          <div class="result-content">
            <div class="result-header">
              <span class="result-title">{{ result.title }}</span>
            </div>
            <div class="result-description">{{ result.description }}</div>
            <div v-if="result.suggestions && result.suggestions.length > 0" class="suggestions">
              <div v-for="(suggestion, sIndex) in result.suggestions" :key="sIndex" class="suggestion-item">
                <span class="suggestion-bullet">→</span> {{ suggestion }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="preflight-footer">
      <button class="btn btn-ghost" @click="emit('close')">Cancel</button>
      <button class="btn btn-primary" @click="runPreflightChecks" :disabled="loading">
        {{ loading ? 'Running...' : 'Re-run Checks' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.preflight {
  display: flex;
  flex-direction: column;
  background: var(--oterm-bg, #1e1e1e);
  color: var(--oterm-text, #d4d4d4);
  width: 100%;
  max-width: 500px;
  max-height: 85vh;
  margin: 0 auto;
  border-radius: 6px;
  border: 1px solid var(--oterm-border, #333);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  font-family: var(--oterm-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif);
  font-size: 13px;
  overflow: hidden;
}

.preflight-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--oterm-border, #333);
  background: var(--oterm-bg-alt, #252526);
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--oterm-text, #d4d4d4);
  letter-spacing: 0.05em;
}

.subtitle {
  font-size: 11px;
  color: var(--oterm-text-muted, #858585);
}

.btn-icon {
  background: transparent;
  border: none;
  color: var(--oterm-text-muted, #858585);
  cursor: pointer;
  font-size: 14px;
  padding: 4px;
  line-height: 1;
  border-radius: 2px;
}

.btn-icon:hover {
  color: var(--oterm-text, #d4d4d4);
  background: var(--oterm-hover, rgba(255, 255, 255, 0.1));
}

.preflight-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.loading-state, .empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 0;
  color: var(--oterm-text-muted, #858585);
}

.spinner {
  width: 14px;
  height: 14px;
  border: 1px solid var(--oterm-border, #333);
  border-top-color: var(--oterm-text, #d4d4d4);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.success-icon {
  color: var(--oterm-success, #89d185);
  font-weight: bold;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--oterm-border, #333);
  border-radius: 4px;
  background: var(--oterm-bg-alt, #252526);
}

.result-item.error {
  border-left: 3px solid var(--oterm-error, #f14c4c);
}

.result-item.warning {
  border-left: 3px solid var(--oterm-warning, #cca700);
}

.result-item.info, .result-item.suggestion {
  border-left: 3px solid var(--oterm-info, #3794ff);
}

.result-icon {
  font-family: var(--oterm-font-mono, monospace);
  font-weight: bold;
  font-size: 14px;
  display: flex;
  align-items: center;
}

.icon-error { color: var(--oterm-error, #f14c4c); }
.icon-warning { color: var(--oterm-warning, #cca700); }
.icon-info { color: var(--oterm-info, #3794ff); }

.result-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.result-title {
  font-weight: 500;
  color: var(--oterm-text, #d4d4d4);
}

.result-description {
  color: var(--oterm-text-muted, #858585);
  line-height: 1.4;
}

.suggestions {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.suggestion-item {
  color: var(--oterm-text, #d4d4d4);
  font-size: 12px;
  line-height: 1.4;
  display: flex;
  gap: 6px;
}

.suggestion-bullet {
  color: var(--oterm-text-muted, #858585);
}

.preflight-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--oterm-border, #333);
  background: var(--oterm-bg-alt, #252526);
}

.btn {
  padding: 4px 12px;
  border-radius: 2px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
  font-family: inherit;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-ghost {
  background: transparent;
  color: var(--oterm-text-muted, #858585);
  border: 1px solid var(--oterm-border, #333);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--oterm-hover, rgba(255, 255, 255, 0.1));
  color: var(--oterm-text, #d4d4d4);
}

.btn-primary {
  background: var(--oterm-brand, #007acc);
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: var(--oterm-brand-hover, #005f9e);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
