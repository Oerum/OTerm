export interface ProcessEntry {
  pid: number;
  parentPid: number | null;
  name: string;
  exe: string | null;
  cmd: string;
  memory: number;
  isKillable: boolean;
}

export interface ProcessListSummary {
  processes: ProcessEntry[];
  selfPid: number;
}
