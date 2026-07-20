use crate::process::git_program;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebaseTodoInfo {
    pub action: String,
    pub commit: String,
    pub message: String,
}

pub fn get_rebase_todo(repo_root: String) -> Result<Vec<RebaseTodoInfo>, String> {
    let mut cmd = Command::new(git_program());
    cmd.current_dir(&repo_root);
    cmd.arg("rev-parse").arg("--git-path").arg("rebase-merge");
    let out = cmd.output().map_err(|e| e.to_string())?;
    let git_path_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let path = PathBuf::from(&repo_root).join(git_path_str).join("git-rebase-todo");
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut todos = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') { continue; }
        let parts: Vec<&str> = line.splitn(3, ' ').collect();
        if parts.len() >= 2 {
            todos.push(RebaseTodoInfo {
                action: parts[0].to_string(),
                commit: parts[1].to_string(),
                message: parts.get(2).unwrap_or(&"").to_string(),
            });
        }
    }
    Ok(todos)
}

pub fn set_rebase_todo(repo_root: String, todos: Vec<RebaseTodoInfo>) -> Result<(), String> {
    let mut cmd = Command::new(git_program());
    cmd.current_dir(&repo_root);
    cmd.arg("rev-parse").arg("--git-path").arg("rebase-merge");
    let out = cmd.output().map_err(|e| e.to_string())?;
    let git_path_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let path = PathBuf::from(&repo_root).join(git_path_str).join("git-rebase-todo");
    let mut out = String::new();
    for t in todos {
        out.push_str(&format!("{} {} {}\n", t.action, t.commit, t.message));
    }
    std::fs::write(path, out).map_err(|e| e.to_string())
}

pub fn git_rebase_action(repo_root: String, action: String) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    let mut cmd = Command::new(git_program());
    cmd.current_dir(&root);
    cmd.arg("rebase").arg(format!("--{}", action));
    
    let out = cmd.output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).into_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rebase_todo_parsing() {
        let dir = std::env::temp_dir().join(format!("rebase_test_{}", std::time::UNIX_EPOCH.elapsed().unwrap().as_nanos()));
        std::fs::create_dir_all(dir.join(".git/rebase-merge")).unwrap();
        
        let _ = Command::new(git_program())
            .arg("init")
            .current_dir(&dir)
            .output();
            
        let path = dir.join(".git/rebase-merge/git-rebase-todo");
        std::fs::write(&path, "pick 1234567 init\n# comment\nsquash 89abcdef feat").unwrap();

        let todos = get_rebase_todo(dir.to_string_lossy().into_owned()).unwrap();
        assert_eq!(todos.len(), 2);
        assert_eq!(todos[0].action, "pick");
        assert_eq!(todos[1].action, "squash");
    }
}
