//! Process-tree agent detection. Keep agent ids in sync with src/lib/terminalAgentMode.ts.

use std::collections::HashMap;

use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};

struct AgentDef {
    id: &'static str,
    prefixes: &'static [&'static str],
    package_hints: &'static [&'static str],
}

const AGENTS: &[AgentDef] = &[
    AgentDef {
        id: "claude",
        prefixes: &["claude"],
        package_hints: &["claude"],
    },
    AgentDef {
        id: "gemini",
        prefixes: &["gemini"],
        package_hints: &["gemini"],
    },
    AgentDef {
        id: "codex",
        prefixes: &["codex"],
        package_hints: &["codex"],
    },
    AgentDef {
        id: "opencode",
        prefixes: &["opencode"],
        package_hints: &["opencode"],
    },
    AgentDef {
        id: "copilot",
        prefixes: &["copilot"],
        package_hints: &["copilot"],
    },
    AgentDef {
        id: "cursor",
        prefixes: &["agent"],
        package_hints: &["cursor"],
    },
    AgentDef {
        id: "amp",
        prefixes: &["amp"],
        package_hints: &["amp"],
    },
    AgentDef {
        id: "droid",
        prefixes: &["droid"],
        package_hints: &["droid"],
    },
    AgentDef {
        id: "pi",
        prefixes: &["pi"],
        package_hints: &["pi"],
    },
    AgentDef {
        id: "auggie",
        prefixes: &["auggie"],
        package_hints: &["auggie"],
    },
    AgentDef {
        id: "goose",
        prefixes: &["goose"],
        package_hints: &["goose"],
    },
    AgentDef {
        id: "hermes",
        prefixes: &["hermes"],
        package_hints: &["hermes"],
    },
    AgentDef {
        id: "vibe",
        prefixes: &["vibe", "vibe-acp"],
        package_hints: &["vibe"],
    },
    AgentDef {
        id: "agy",
        prefixes: &["agy"],
        package_hints: &["agy"],
    },
];

const PACKAGE_RUNNERS: &[&str] = &["node", "nodejs", "bun", "deno"];

fn exe_stem(name: &str) -> String {
    let base = name.rsplit(['\\', '/']).next().unwrap_or(name);
    base.strip_suffix(".exe")
        .or_else(|| base.strip_suffix(".EXE"))
        .unwrap_or(base)
        .to_ascii_lowercase()
}

pub fn match_agent_from_process(name: &str, cmd: &[String]) -> Option<&'static str> {
    let stem = exe_stem(name);

    for agent in AGENTS {
        if agent.prefixes.iter().any(|prefix| stem == *prefix) {
            return Some(agent.id);
        }
    }

    if !PACKAGE_RUNNERS.contains(&stem.as_str()) {
        return None;
    }

    let joined = cmd
        .iter()
        .map(|part| part.to_ascii_lowercase())
        .collect::<Vec<_>>()
        .join(" ");

    for agent in AGENTS {
        if agent.package_hints.iter().any(|hint| joined.contains(hint)) {
            return Some(agent.id);
        }
    }

    None
}

/// Walk descendants of `root_pid` and return the deepest matching agent id, if any.
pub fn detect_agent_in_tree(system: &mut System, root_pid: u32) -> Option<String> {
    system
        .refresh_specifics(RefreshKind::nothing().with_processes(ProcessRefreshKind::everything()));

    let root = Pid::from_u32(root_pid);
    system.process(root)?;

    let mut children_map: HashMap<Pid, Vec<Pid>> = HashMap::new();
    for (pid, process) in system.processes() {
        if let Some(parent) = process.parent() {
            children_map.entry(parent).or_default().push(*pid);
        }
    }

    let mut best: Option<(usize, &'static str)> = None;
    let mut queue = vec![(root, 0usize)];

    while let Some((pid, depth)) = queue.pop() {
        if let Some(process) = system.process(pid) {
            let name = process.name().to_string_lossy();
            let cmd: Vec<String> = process
                .cmd()
                .iter()
                .map(|part| part.to_string_lossy().into_owned())
                .collect();
            if let Some(agent_id) = match_agent_from_process(&name, &cmd) {
                if best
                    .map(|(best_depth, _)| depth > best_depth)
                    .unwrap_or(true)
                {
                    best = Some((depth, agent_id));
                }
            }
        }

        if let Some(children) = children_map.get(&pid) {
            for &child in children {
                queue.push((child, depth + 1));
            }
        }
    }

    best.map(|(_, id)| id.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_direct_executable_stems() {
        assert_eq!(match_agent_from_process("claude.exe", &[]), Some("claude"));
        assert_eq!(match_agent_from_process("opencode", &[]), Some("opencode"));
        assert_eq!(match_agent_from_process("AGY.EXE", &[]), Some("agy"));
        assert_eq!(match_agent_from_process("agent", &[]), Some("cursor"));
        assert_eq!(match_agent_from_process("vibe-acp", &[]), Some("vibe"));
    }

    #[test]
    fn matches_package_runner_command_lines() {
        assert_eq!(
            match_agent_from_process(
                "node.exe",
                &["node".into(), "node_modules/.bin/opencode".into()],
            ),
            Some("opencode")
        );
        assert_eq!(
            match_agent_from_process("bun", &["bun".into(), "agy".into(), "run".into()]),
            Some("agy")
        );
        assert_eq!(
            match_agent_from_process(
                "node",
                &[
                    "node".into(),
                    "/path/to/@anthropic-ai/claude-code/cli.js".into()
                ],
            ),
            Some("claude")
        );
    }

    #[test]
    fn ignores_unrelated_processes() {
        assert_eq!(match_agent_from_process("pwsh.exe", &[]), None);
        assert_eq!(
            match_agent_from_process("node.exe", &["node".into(), "server.js".into()]),
            None
        );
    }
}
