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
