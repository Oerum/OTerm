import { invoke } from '@tauri-apps/api/core';

export interface TerminalSyncState {
    output: string;
    guiState: string;
}

export async function captureTerminalOutput(repoRoot: string, output: string): Promise<void> {
    return invoke('git_capture_terminal_output', { repoRoot, output });
}

export async function updateGuiState(repoRoot: string, guiState: string): Promise<void> {
    return invoke('git_update_gui_state', { repoRoot, guiState });
}

export async function getSyncState(repoRoot: string): Promise<TerminalSyncState> {
    return invoke('git_get_sync_state', { repoRoot });
}
