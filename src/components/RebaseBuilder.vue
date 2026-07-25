<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'

const emit = defineEmits<{
  (e: "close"): void;
}>();

const props = defineProps<{
  repoRoot: string | null
}>()

interface RebaseTodoItem {
  id: string
  action: string
  commitHash: string
  message: string
}

const todoList = ref<RebaseTodoItem[]>([])
const loading = ref(false)

const actions = ['pick', 'reword', 'edit', 'squash', 'fixup', 'drop']

const loadRebaseTodo = async () => {
  loading.value = true
  try {
    if (!props.repoRoot) throw new Error('No repository selected')
    todoList.value = await invoke('git_get_rebase_todo', { repo_root: props.repoRoot })
  } catch (error) {
    console.error('Failed to load rebase todo list:', error)
  } finally {
    loading.value = false
  }
}

const saveAndContinue = async () => {
  try {
    if (!props.repoRoot) return
    await invoke('git_set_rebase_todo', { 
      repo_root: props.repoRoot, 
      todos: todoList.value 
    })
    // Optionally trigger rebase continue here
  } catch (error) {
    console.error('Failed to save rebase todo list:', error)
  }
}

const moveUp = (index: number) => {
  if (index > 0) {
    const item = todoList.value[index]
    todoList.value.splice(index, 1)
    todoList.value.splice(index - 1, 0, item)
  }
}

const moveDown = (index: number) => {
  if (index < todoList.value.length - 1) {
    const item = todoList.value[index]
    todoList.value.splice(index, 1)
    todoList.value.splice(index + 1, 0, item)
  }
}

onMounted(() => {
  loadRebaseTodo()
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
        <h3 class="text-[13px] font-medium text-[var(--oterm-text)]">Interactive Rebase Builder</h3>
      </div>
      <button 
        class="rounded-sm border border-[var(--oterm-border)] bg-transparent px-2.5 py-1 text-xs font-medium text-[var(--oterm-text)] hover:border-[var(--oterm-border-strong)] hover:bg-white/5 transition-colors"
        @click="saveAndContinue"
      >
        Save & Continue
      </button>
    </div>
    
    <div class="flex-1 overflow-y-auto p-4">
      <div v-if="loading" class="text-xs text-[var(--oterm-faint)]">Loading rebase plan...</div>
      
      <div v-else class="flex flex-col border border-[var(--oterm-border)] rounded-sm bg-transparent">
        <div 
          v-for="(item, index) in todoList" 
          :key="item.id" 
          class="group flex items-center gap-3 border-b border-[var(--oterm-border)] last:border-b-0 px-3 py-1.5 transition-colors hover:bg-white/5"
        >
          <div class="cursor-grab text-[var(--oterm-faint)] group-hover:text-[var(--oterm-muted)] w-4 text-center">⋮⋮</div>
          <select 
            v-model="item.action" 
            class="rounded-sm border border-transparent bg-transparent px-1.5 py-1 text-xs font-medium text-[var(--oterm-text)] outline-none hover:bg-white/5 focus:border-[var(--oterm-border-strong)] focus:bg-transparent"
            aria-label="Commit action"
          >
            <option v-for="act in actions" :key="act" :value="act">{{ act }}</option>
          </select>
          <div class="w-14 font-mono text-xs text-[var(--oterm-muted)]">{{ item.commitHash.substring(0, 7) }}</div>
          <input 
            v-model="item.message" 
            class="flex-1 bg-transparent text-sm text-[var(--oterm-text)] outline-none disabled:opacity-40 disabled:cursor-not-allowed placeholder:text-[var(--oterm-faint)]" 
            :disabled="item.action !== 'reword'" 
            aria-label="Commit message"
          />
          <div class="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button 
              @click="moveUp(index)" 
              :disabled="index === 0"
              class="flex h-5 w-5 items-center justify-center rounded-sm hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent text-[var(--oterm-faint)] hover:text-[var(--oterm-text)]"
              aria-label="Move up"
              title="Move up"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
            </button>
            <button 
              @click="moveDown(index)" 
              :disabled="index === todoList.length - 1"
              class="flex h-5 w-5 items-center justify-center rounded-sm hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent text-[var(--oterm-faint)] hover:text-[var(--oterm-text)]"
              aria-label="Move down"
              title="Move down"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
        </div>
        
        <div v-if="todoList.length === 0" class="p-6 text-center text-xs text-[var(--oterm-faint)]">
          No rebase in progress.
        </div>
      </div>
    </div>
  </div>
</template>
