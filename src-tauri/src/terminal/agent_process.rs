//! Process-tree agent detection. Cases are shared with terminalAgentMode.fixtures.json.
use std::collections::{HashMap, HashSet, VecDeque};
use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System, UpdateKind};
struct AgentDef {
    id: &'static str,
    prefixes: &'static [&'static str],
    packages: &'static [&'static str],
}
const AGENTS: &[AgentDef] = &[
    AgentDef {
        id: "claude",
        prefixes: &["claude"],
        packages: &["claude", "@anthropic-ai/claude-code"],
    },
    AgentDef {
        id: "gemini",
        prefixes: &["gemini"],
        packages: &["gemini", "@google/gemini-cli"],
    },
    AgentDef {
        id: "agy",
        prefixes: &["agy"],
        packages: &["agy"],
    },
    AgentDef {
        id: "codex",
        prefixes: &["codex"],
        packages: &["codex", "@openai/codex"],
    },
    AgentDef {
        id: "opencode",
        prefixes: &["opencode"],
        packages: &["opencode", "opencode-ai"],
    },
    AgentDef {
        id: "copilot",
        prefixes: &["copilot"],
        packages: &["copilot", "@github/copilot"],
    },
    AgentDef {
        id: "cursor",
        prefixes: &["agent"],
        packages: &["cursor"],
    },
    AgentDef {
        id: "amp",
        prefixes: &["amp"],
        packages: &["amp", "@sourcegraph/amp"],
    },
    AgentDef {
        id: "droid",
        prefixes: &["droid"],
        packages: &["droid"],
    },
    AgentDef {
        id: "pi",
        prefixes: &["pi"],
        packages: &[
            "pi",
            "@mariozechner/pi-coding-agent",
            "@earendil-works/pi-coding-agent",
        ],
    },
    AgentDef {
        id: "auggie",
        prefixes: &["auggie"],
        packages: &["auggie", "@augmentcode/auggie"],
    },
    AgentDef {
        id: "goose",
        prefixes: &["goose"],
        packages: &["goose"],
    },
    AgentDef {
        id: "hermes",
        prefixes: &["hermes"],
        packages: &["hermes"],
    },
    AgentDef {
        id: "vibe",
        prefixes: &["vibe", "vibe-acp"],
        packages: &["vibe"],
    },
    AgentDef {
        id: "cline",
        prefixes: &["cline"],
        packages: &["cline"],
    },
    AgentDef {
        id: "aider",
        prefixes: &["aider"],
        packages: &["aider", "aider-chat"],
    },
    AgentDef {
        id: "kilo",
        prefixes: &["kilo"],
        packages: &["kilo", "@kilocode/cli"],
    },
    AgentDef {
        id: "kimi",
        prefixes: &["kimi"],
        packages: &["kimi", "@moonshot-ai/kimi-code"],
    },
    AgentDef {
        id: "kiro",
        prefixes: &["kiro-cli"],
        packages: &["kiro-cli"],
    },
    AgentDef {
        id: "qwen",
        prefixes: &["qwen"],
        packages: &["qwen", "@qwen-code/qwen-code"],
    },
    AgentDef {
        id: "continue",
        prefixes: &["cn"],
        packages: &["cn", "@continuedev/cli"],
    },
    AgentDef {
        id: "codebuff",
        prefixes: &["codebuff"],
        packages: &["codebuff"],
    },
    AgentDef {
        id: "crush",
        prefixes: &["crush"],
        packages: &["crush", "@charmland/crush"],
    },
    AgentDef {
        id: "rovodev",
        prefixes: &["acli rovodev run"],
        packages: &[],
    },
    AgentDef {
        id: "omp",
        prefixes: &["omp"],
        packages: &["omp", "@oh-my-pi/pi-coding-agent"],
    },
];
fn exe_stem(name: &str) -> String {
    let base = name
        .trim_matches(['"', '\''])
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(name)
        .to_ascii_lowercase();
    [".exe", ".cmd", ".bat", ".com"]
        .iter()
        .find_map(|extension| base.strip_suffix(extension))
        .unwrap_or(&base)
        .to_string()
}
fn package_agent(token: &str) -> Option<&'static str> {
    let lower = token.to_ascii_lowercase();
    let version_start = lower
        .char_indices()
        .skip(1)
        .find(|(_, ch)| *ch == '@')
        .map(|(index, _)| index);
    let package = &lower[..version_start.unwrap_or(lower.len())];
    AGENTS
        .iter()
        .find(|agent| agent.packages.contains(&package))
        .map(|agent| agent.id)
}
fn script_agent(token: &str) -> Option<&'static str> {
    let path = token.replace('\\', "/").to_ascii_lowercase();
    let parts: Vec<_> = path.split('/').collect();
    let base = parts.last().copied().unwrap_or("");
    let stem = exe_stem(base);
    let script_stem = [".js", ".mjs", ".cjs", ".py"]
        .iter()
        .find_map(|extension| stem.strip_suffix(extension))
        .unwrap_or(&stem);
    if let Some(agent) = AGENTS
        .iter()
        .find(|agent| agent.prefixes.contains(&script_stem))
    {
        return Some(agent.id);
    }
    if let Some(index) = parts.iter().rposition(|part| *part == "node_modules") {
        let root = parts.get(index + 1).copied().unwrap_or("");
        let package = if root.starts_with('@') {
            format!("{root}/{}", parts.get(index + 2).unwrap_or(&""))
        } else {
            root.to_string()
        };
        return package_agent(&package);
    }
    if let Some(index) = parts.iter().position(|part| part.starts_with('@')) {
        return package_agent(&format!(
            "{}/{}",
            parts[index],
            parts.get(index + 1).unwrap_or(&"")
        ));
    }
    match (
        parts
            .get(parts.len().wrapping_sub(2))
            .copied()
            .unwrap_or(""),
        base,
    ) {
        ("agy", "cli.js") => Some("agy"),
        ("aider", "__main__.py") => Some("aider"),
        _ => None,
    }
}
fn supports_unsloth(id: &str) -> bool {
    ["claude", "codex", "opencode", "hermes", "pi"].contains(&id)
}
fn detect_tokens(tokens: &[String]) -> Option<&'static str> {
    let first = exe_stem(tokens.first()?);
    let at = |index| tokens.get(index).map(String::as_str).unwrap_or("");
    if first == "unsloth" {
        return if at(1) == "start" && supports_unsloth(at(2)) {
            AGENTS
                .iter()
                .find(|agent| agent.id == at(2))
                .map(|agent| agent.id)
        } else {
            None
        };
    }
    if first == "acli" {
        return (at(1) == "rovodev" && at(2) == "run").then_some("rovodev");
    }
    if let Some(agent) = AGENTS
        .iter()
        .find(|agent| agent.prefixes.contains(&first.as_str()))
    {
        return Some(agent.id);
    }
    if ["npx", "bunx"].contains(&first.as_str()) {
        let mut index = 1;
        while ["-y", "--yes", "--no-install", "--"].contains(&at(index)) {
            index += 1;
        }
        return package_agent(at(index));
    }
    if first == "pnpm" || first == "npm" {
        if first == "pnpm" && at(1) == "dlx" {
            return package_agent(at(2));
        }
        return if at(1) == "exec" {
            package_agent(at(if at(2) == "--" { 3 } else { 2 }))
        } else {
            None
        };
    }
    if ["node", "nodejs", "bun", "deno"].contains(&first.as_str()) {
        let mut index = 1;
        if ["run", "--"].contains(&at(index)) {
            index += 1;
        }
        while ["--require", "-r", "--import", "--loader"].contains(&at(index)) {
            index += 2;
        }
        return script_agent(at(index)).or_else(|| {
            if first == "bun" {
                package_agent(at(index))
            } else {
                None
            }
        });
    }
    if first == "python"
        || first == "python3"
        || first.strip_prefix("python3.").is_some_and(|suffix| {
            !suffix.is_empty() && suffix.chars().all(|ch| ch.is_ascii_digit())
        })
    {
        return if at(1) == "-m" {
            package_agent(at(2))
        } else {
            script_agent(at(1))
        };
    }
    None
}
pub fn match_agent_from_process(name: &str, cmd: &[String]) -> Option<&'static str> {
    let mut tokens = vec![name.to_string()];
    if !cmd.is_empty() {
        tokens.extend_from_slice(&cmd[1..]);
    }
    detect_tokens(&tokens)
}
pub fn refresh_processes(system: &mut System) {
    system.refresh_specifics(
        RefreshKind::nothing()
            .with_processes(ProcessRefreshKind::nothing().with_cmd(UpdateKind::OnlyIfNotSet)),
    );
}
pub struct ProcessTree<'a> {
    system: &'a System,
    children: HashMap<Pid, Vec<Pid>>,
}
impl<'a> ProcessTree<'a> {
    pub fn new(system: &'a System) -> Self {
        let mut children: HashMap<Pid, Vec<Pid>> = HashMap::new();
        for (pid, process) in system.processes() {
            if let Some(parent) = process.parent() {
                children.entry(parent).or_default().push(*pid);
            }
        }
        for siblings in children.values_mut() {
            siblings.sort_unstable_by_key(|pid| pid.as_u32());
        }
        Self { system, children }
    }
    pub fn contains(&self, root_pid: u32) -> bool {
        self.system.process(Pid::from_u32(root_pid)).is_some()
    }
    pub fn detect_agent(&self, root_pid: u32) -> Option<String> {
        let root = Pid::from_u32(root_pid);
        self.system.process(root)?;
        let mut queue = VecDeque::from([root]);
        let mut visited = HashSet::new();
        while let Some(pid) = queue.pop_front() {
            if !visited.insert(pid) {
                continue;
            }
            if let Some(process) = self.system.process(pid) {
                let cmd = process
                    .cmd()
                    .iter()
                    .map(|part| part.to_string_lossy().into_owned())
                    .collect::<Vec<_>>();
                if let Some(id) = match_agent_from_process(&process.name().to_string_lossy(), &cmd)
                {
                    return Some(id.to_string());
                }
            }
            if let Some(children) = self.children.get(&pid) {
                queue.extend(children);
            }
        }
        None
    }
    pub fn detect_active_process(&self, root_pid: u32) -> Option<ActiveProcessInfo> {
        let root = Pid::from_u32(root_pid);
        self.system.process(root)?;
        let mut queue = vec![(root, None)];
        let mut leaves = HashSet::new();
        let mut visited = HashSet::new();
        while let Some((pid, ancestor)) = queue.pop() {
            if !visited.insert(pid) {
                continue;
            }
            let mut nearest = ancestor;
            if pid != root {
                if let Some(process) = self.system.process(pid) {
                    if !IGNORED_PROCESSES
                        .contains(&exe_stem(&process.name().to_string_lossy()).as_str())
                    {
                        if let Some(ancestor) = ancestor {
                            leaves.remove(&ancestor);
                        }
                        leaves.insert(pid);
                        nearest = Some(pid);
                    }
                }
            }
            if let Some(children) = self.children.get(&pid) {
                queue.extend(children.iter().map(|child| (*child, nearest)));
            }
        }
        let pid = leaves.into_iter().max_by_key(|pid| pid.as_u32())?;
        let process = self.system.process(pid)?;
        let name = process.name().to_string_lossy();
        let cmd = process
            .cmd()
            .iter()
            .map(|part| part.to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        Some(ActiveProcessInfo {
            name: exe_stem(&name),
            command: clean_command_line(&name, &cmd),
        })
    }
}
pub fn detect_agent_in_tree(system: &mut System, root_pid: u32) -> Option<String> {
    refresh_processes(system);
    ProcessTree::new(system).detect_agent(root_pid)
}
const IGNORED_PROCESSES: &[&str] = &[
    "conhost",
    "openconsole",
    "wslhost",
    "init",
    "systemd",
    "cmd",
    "powershell",
    "pwsh",
    "bash",
    "zsh",
    "fish",
    "sh",
    "wsl",
    "ssh-agent",
];
#[derive(Clone, serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActiveProcessInfo {
    pub name: String,
    pub command: String,
}
fn clean_command_line(name: &str, cmd: &[String]) -> String {
    if cmd.is_empty() {
        return exe_stem(name);
    }
    let joined = cmd
        .iter()
        .enumerate()
        .map(|(index, part)| {
            if index == 0 {
                exe_stem(part)
            } else {
                part.rsplit(['\\', '/']).next().unwrap_or(part).to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    if joined.chars().count() > 60 {
        format!("{}...", joined.chars().take(57).collect::<String>())
    } else {
        joined
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn frontend_and_native_share_all_detection_cases() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../src/lib/terminalAgentMode.fixtures.json"
        ))
        .unwrap();
        assert_eq!(AGENTS.len(), 25);
        for case in fixture.as_array().unwrap() {
            let argv: Vec<String> = case["argv"]
                .as_array()
                .unwrap()
                .iter()
                .map(|part| part.as_str().unwrap().to_string())
                .collect();
            assert_eq!(
                match_agent_from_process(&argv[0], &argv),
                case["expected"].as_str(),
                "{}",
                case["command"]
            );
        }
    }
    #[test]
    fn command_label_truncation_is_utf8_safe() {
        let command = clean_command_line("echo", &["echo".into(), "\u{1f600}".repeat(70)]);
        assert_eq!(command.chars().count(), 60);
        assert!(command.ends_with("..."));
        assert_eq!(
            clean_command_line(
                "node.exe",
                &["C:\\node.exe".into(), "C:\\repo\\vite.js".into()]
            ),
            "node vite.js"
        );
    }
}
