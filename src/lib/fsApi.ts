import { invoke } from "@tauri-apps/api/core";
import type { FsEntry, FsEnvImportHint, FsToolsDirectoryHints } from "../types/fs";

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

export function openInZed(path: string): Promise<void> {
  return invoke<void>("fs_open_in_zed", { path });
}

export function openInFileExplorer(path: string): Promise<void> {
  return invoke<void>("fs_open_in_file_explorer", { path });
}

export function getToolsDirectoryHints(directory: string): Promise<FsToolsDirectoryHints> {
  return invoke<FsToolsDirectoryHints>("fs_tools_directory_hints", { directory });
}

export function openInVisualStudio(solutionPath: string): Promise<void> {
  return invoke<void>("fs_open_in_visual_studio", { solutionPath });
}

export function openInRider(solutionPath: string): Promise<void> {
  return invoke<void>("fs_open_in_rider", { solutionPath });
}

export function importEnvFile(directory: string): Promise<FsEnvImportHint> {
  return invoke<FsEnvImportHint>("fs_import_env_file", { directory });
}

export function userHome(): Promise<string> {
  return invoke<string>("fs_user_home");
}

export async function readFile(path: string): Promise<Uint8Array> {
  const data = await invoke<number[]>("fs_read_file", { path });
  return Uint8Array.from(data);
}

export function writeFile(path: string, data: Uint8Array): Promise<void> {
  return invoke<void>("fs_write_file", { path, data: Array.from(data) });
}

export function createDir(path: string): Promise<void> {
  return invoke<void>("fs_create_dir", { path });
}

export function removePath(path: string, isDir: boolean): Promise<void> {
  return invoke<void>("fs_remove_path", { path, isDir });
}
