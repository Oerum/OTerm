<script setup lang="ts">
import { ref, shallowRef, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'

const emit = defineEmits<{
  (e: "close"): void;
}>();

const props = defineProps<{
  repoRoot: string | null;
}>()

// ⚡ Bolt Optimization: Use shallowRef for completely reassigned conflicts list to prevent deep reactivity overhead
const conflicts = shallowRef<any[]>([])
const selectedConflict = ref<any | null>(null)
const resolutionContent = ref('')

const fetchConflicts = async () => {
  try {
    if (!props.repoRoot) throw new Error('No repository selected')
    conflicts.value = await invoke('git_get_merge_conflicts', { repo_root: props.repoRoot })
    if (conflicts.value.length > 0) {
      selectConflict(conflicts.value[0])
    }
  } catch (error) {
    console.error('Failed to get merge conflicts:', error)
  }
}

const selectConflict = (conflict: any) => {
  selectedConflict.value = conflict
  resolutionContent.value = conflict.baseContent // Default starting point
}

const resolveConflict = async (resolution: string) => {
  if (!selectedConflict.value) return
  try {
    if (!props.repoRoot) return
    await invoke('git_resolve_conflict', {
      repo_root: props.repoRoot,
      file_path: selectedConflict.value.filePath,
      resolved_content: resolution
    })
    // Refresh
    await fetchConflicts()
  } catch (error) {
    console.error('Failed to resolve conflict:', error)
  }
}

onMounted(() => {
  fetchConflicts()
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
        <h3 class="text-[13px] font-medium text-[var(--oterm-text)]">Resolve Merge Conflicts</h3>
      </div>
    </div>
    
    <div class="flex flex-1 min-h-0 overflow-hidden">
      <div class="w-64 flex-shrink-0 border-r border-[var(--oterm-border)] flex flex-col">
        <div class="px-3 py-2 border-b border-[var(--oterm-border)]">
          <h4 class="text-[11px] font-medium text-[var(--oterm-faint)] uppercase tracking-wider">Conflicted Files</h4>
        </div>
        <ul class="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          <li v-for="conflict in conflicts" :key="conflict.filePath" 
              @click="selectConflict(conflict)"
              :class="[
                'cursor-pointer rounded-sm px-2 py-1.5 text-xs transition-colors',
                selectedConflict?.filePath === conflict.filePath 
                  ? 'bg-white/10 text-[var(--oterm-text)] font-medium' 
                  : 'text-[var(--oterm-muted)] hover:bg-white/5 hover:text-[var(--oterm-text)]'
              ]">
            {{ conflict.filePath }}
          </li>
        </ul>
        <div v-if="conflicts.length === 0" class="p-4 text-center text-xs text-[var(--oterm-faint)]">
          No merge conflicts found.
        </div>
      </div>
      
      <div class="flex flex-1 flex-col overflow-y-auto bg-[var(--oterm-bg)]" v-if="selectedConflict">
        <div class="flex items-center border-b border-[var(--oterm-border)] px-4 py-2">
          <span class="text-xs font-medium text-[var(--oterm-text)]">Resolving:</span>
          <span class="ml-2 font-mono text-xs text-[var(--oterm-muted)]">{{ selectedConflict.filePath }}</span>
        </div>
        
        <div class="flex flex-col gap-4 p-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col rounded-sm border border-[var(--oterm-border)] bg-[var(--oterm-panel)]/30 overflow-hidden">
              <div class="flex items-center justify-between border-b border-[var(--oterm-border)] bg-white/5 px-3 py-1.5">
                <span class="text-xs font-medium text-[var(--oterm-muted)]">Our Changes</span>
                <button 
                  @click="resolveConflict(selectedConflict.ourContent)"
                  class="rounded-sm border border-[var(--oterm-border)] bg-transparent px-2 py-0.5 text-[11px] font-medium text-[var(--oterm-text)] hover:border-[var(--oterm-border-strong)] hover:bg-white/5 transition-colors"
                >
                  Accept Ours
                </button>
              </div>
              <div class="p-3 overflow-x-auto text-[13px] font-mono text-[var(--oterm-text)] leading-relaxed">
                <pre class="m-0"><code>{{ selectedConflict.ourContent }}</code></pre>
              </div>
            </div>
            
            <div class="flex flex-col rounded-sm border border-[var(--oterm-border)] bg-[var(--oterm-panel)]/30 overflow-hidden">
              <div class="flex items-center justify-between border-b border-[var(--oterm-border)] bg-white/5 px-3 py-1.5">
                <span class="text-xs font-medium text-[var(--oterm-muted)]">Incoming Changes</span>
                <button 
                  @click="resolveConflict(selectedConflict.theirContent)"
                  class="rounded-sm border border-[var(--oterm-border)] bg-transparent px-2 py-0.5 text-[11px] font-medium text-[var(--oterm-text)] hover:border-[var(--oterm-border-strong)] hover:bg-white/5 transition-colors"
                >
                  Accept Theirs
                </button>
              </div>
              <div class="p-3 overflow-x-auto text-[13px] font-mono text-[var(--oterm-text)] leading-relaxed">
                <pre class="m-0"><code>{{ selectedConflict.theirContent }}</code></pre>
              </div>
            </div>
          </div>
          
          <div class="flex flex-col rounded-sm border border-[var(--oterm-border)] bg-[var(--oterm-bg)] overflow-hidden">
            <div class="flex items-center justify-between border-b border-[var(--oterm-border)] bg-white/5 px-3 py-1.5">
              <span class="text-xs font-medium text-[var(--oterm-muted)]">Manual Resolution</span>
              <button 
                @click="resolveConflict(resolutionContent)"
                class="rounded-sm border border-[var(--oterm-border)] bg-transparent px-2.5 py-1 text-xs font-medium text-[var(--oterm-text)] hover:border-[var(--oterm-border-strong)] hover:bg-white/5 transition-colors"
              >
                Save Resolution
              </button>
            </div>
            <textarea 
              v-model="resolutionContent" 
              rows="10"
              class="w-full resize-y border-none bg-transparent p-3 font-mono text-[13px] leading-relaxed text-[var(--oterm-text)] outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--oterm-border-strong)] placeholder:text-[var(--oterm-faint)] transition-shadow"
              placeholder="Edit manually here..."
            ></textarea>
          </div>
        </div>
      </div>
      
      <div v-else class="flex flex-1 items-center justify-center bg-[var(--oterm-bg)]">
        <div class="text-xs text-[var(--oterm-faint)]">Select a file to resolve conflicts</div>
      </div>
    </div>
  </div>
</template>
