pub mod commands;

use serde::Serialize;
use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessEntry {
    pub pid: u32,
    pub parent_pid: Option<u32>,
    pub name: String,
    pub exe: Option<String>,
    pub cmd: String,
    pub memory: u64,
    pub is_killable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessListSummary {
    pub processes: Vec<ProcessEntry>,
    pub self_pid: u32,
}

fn current_pid() -> u32 {
    std::process::id()
}

fn is_protected(pid: u32, self_pid: u32) -> bool {
    if pid == self_pid || pid == 0 {
        return true;
    }
    #[cfg(windows)]
    if pid == 4 {
        return true;
    }
    false
}

fn truncate_cmd(cmd: &str) -> String {
    if cmd.len() > 200 {
        format!("{}...", &cmd[..197])
    } else {
        cmd.to_string()
    }
}

pub fn list_processes() -> ProcessListSummary {
    let self_pid = current_pid();
    let mut system = System::new();
    system.refresh_specifics(
        RefreshKind::nothing().with_processes(ProcessRefreshKind::everything()),
    );

    let mut processes: Vec<ProcessEntry> = system
        .processes()
        .iter()
        .map(|(pid, process)| {
            let pid_u32 = pid.as_u32();
            let cmd = truncate_cmd(
                &process
                    .cmd()
                    .iter()
                    .map(|part| part.to_string_lossy().into_owned())
                    .collect::<Vec<_>>()
                    .join(" "),
            );
            ProcessEntry {
                pid: pid_u32,
                parent_pid: process.parent().map(|p| p.as_u32()),
                name: process.name().to_string_lossy().into_owned(),
                exe: process
                    .exe()
                    .map(|p| p.to_string_lossy().into_owned()),
                cmd,
                memory: process.memory(),
                is_killable: !is_protected(pid_u32, self_pid),
            }
        })
        .collect();

    processes.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.pid.cmp(&right.pid))
    });

    ProcessListSummary {
        processes,
        self_pid,
    }
}

pub fn kill_process(pid: u32) -> Result<(), String> {
    let self_pid = current_pid();
    if is_protected(pid, self_pid) {
        return Err("Cannot kill this process".into());
    }

    let mut system = System::new();
    system.refresh_specifics(
        RefreshKind::nothing().with_processes(ProcessRefreshKind::everything()),
    );

    let target = Pid::from_u32(pid);
    let process = system
        .process(target)
        .ok_or_else(|| format!("Process {pid} not found"))?;

    if process.kill() {
        Ok(())
    } else {
        Err(format!("Failed to kill process {pid}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_process_is_protected() {
        let self_pid = current_pid();
        assert!(is_protected(self_pid, self_pid));
        assert!(is_protected(0, self_pid));
    }

    #[test]
    fn truncate_cmd_shortens_long_lines() {
        let long = "x".repeat(250);
        assert_eq!(truncate_cmd(&long).len(), 200);
    }
}
