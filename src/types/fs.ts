export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  modified?: string | null;
}

export interface FsEnvImportHint {
  sourcePath: string;
  targetPath: string;
}

export interface FsToolsDirectoryHints {
  visualStudioAvailable: boolean;
  riderAvailable: boolean;
  vscodeAvailable: boolean;
  zedAvailable: boolean;
  fileExplorerLabel: string;
  solutionFiles: string[];
  envImport: FsEnvImportHint | null;
}
