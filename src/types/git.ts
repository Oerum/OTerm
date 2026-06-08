export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  changedFiles: number;
  additions: number;
  deletions: number;
}
