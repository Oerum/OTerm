import { invoke } from "@tauri-apps/api/core";
import type { FsEntry } from "../types/fs";

export function listDirectory(path?: string): Promise<FsEntry[]> {
  return invoke<FsEntry[]>("fs_list_directory", { path: path ?? null });
}

export function searchFiles(query: string, root?: string): Promise<FsEntry[]> {
  return invoke<FsEntry[]>("fs_search_files", { root: root ?? null, query });
}

export function showShellContextMenu(path: string, x: number, y: number): Promise<void> {
  return invoke<void>("fs_show_shell_context_menu", { path, x, y });
}

export function openInVsCode(path: string): Promise<void> {
  return invoke<void>("fs_open_in_vscode", { path });
}
