import { ref, onMounted, onUnmounted } from 'vue';
import { getSyncState, updateGuiState, captureTerminalOutput, TerminalSyncState } from '../lib/terminalSyncApi';

export function useTerminalSync(repoRoot: string) {
    const syncState = ref<TerminalSyncState>({ output: '', guiState: '' });
    const localGuiState = ref('');
    let pollInterval: number;

    const fetchState = async () => {
        if (!repoRoot) return;
        try {
            const state = await getSyncState(repoRoot);
            syncState.value = state;
            if (state.guiState !== localGuiState.value) {
                localGuiState.value = state.guiState;
            }
        } catch (e) {
            console.error('Failed to get sync state', e);
        }
    };

    const pushGuiState = async (newState: string) => {
        if (!repoRoot) return;
        try {
            localGuiState.value = newState;
            await updateGuiState(repoRoot, newState);
            await fetchState();
        } catch (e) {
            console.error('Failed to update gui state', e);
        }
    };

    const pushTerminalOutput = async (output: string) => {
        if (!repoRoot) return;
        try {
            await captureTerminalOutput(repoRoot, output);
            await fetchState();
        } catch (e) {
            console.error('Failed to capture terminal output', e);
        }
    };

    onMounted(() => {
        if (repoRoot) {
            fetchState();
            pollInterval = window.setInterval(fetchState, 1000);
        }
    });

    onUnmounted(() => {
        if (pollInterval) {
            window.clearInterval(pollInterval);
        }
    });

    return {
        syncState,
        localGuiState,
        pushGuiState,
        pushTerminalOutput
    };
}
