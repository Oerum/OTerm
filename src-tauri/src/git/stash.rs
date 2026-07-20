use crate::process::git_program;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StashInfo {
    pub index: u32,
    pub message: String,
}

pub fn git_stash_list(repo_root: String) -> Result<Vec<StashInfo>, String> {
    let root = PathBuf::from(repo_root);
    let mut cmd = Command::new(git_program());
    cmd.current_dir(&root);
    cmd.arg("stash").arg("list").arg("--format=%gd|%gs");
    
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).into_owned());
    }
    
    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut stashes = Vec::new();
    
    for line in stdout.lines() {
        if line.is_empty() { continue; }
        if let Some((idx_str, msg)) = line.split_once('|') {
            if let Some(idx_str) = idx_str.strip_prefix("stash@{") {
                if let Some(idx_str) = idx_str.strip_suffix("}") {
                    if let Ok(idx) = idx_str.parse::<u32>() {
                        stashes.push(StashInfo {
                            index: idx,
                            message: msg.to_string(),
                        });
                    }
                }
            }
        }
    }
    Ok(stashes)
}

pub fn git_stash_save(repo_root: String, message: String, include_untracked: bool) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    let mut cmd = Command::new(git_program());
    cmd.current_dir(&root);
    cmd.arg("stash").arg("push");
    if include_untracked {
        cmd.arg("--include-untracked");
    }
    cmd.arg("-m").arg(message);
    
    let out = cmd.output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).into_owned())
    }
}

pub fn git_stash_apply(repo_root: String, index: u32) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    let mut cmd = Command::new(git_program());
    cmd.current_dir(&root);
    cmd.arg("stash").arg("apply").arg(format!("stash@{{{}}}", index));
    
    let out = cmd.output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).into_owned())
    }
}

pub fn git_stash_pop(repo_root: String, index: u32) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    let mut cmd = Command::new(git_program());
    cmd.current_dir(&root);
    cmd.arg("stash").arg("pop").arg(format!("stash@{{{}}}", index));
    
    let out = cmd.output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).into_owned())
    }
}

pub fn git_stash_drop(repo_root: String, index: u32) -> Result<(), String> {
    let root = PathBuf::from(repo_root);
    let mut cmd = Command::new(git_program());
    cmd.current_dir(&root);
    cmd.arg("stash").arg("drop").arg(format!("stash@{{{}}}", index));
    
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
    fn test_stash_info_struct() {
        let info = StashInfo {
            index: 0,
            message: "test stash".into(),
        };
        assert_eq!(info.index, 0);
        assert_eq!(info.message, "test stash");
    }
}
