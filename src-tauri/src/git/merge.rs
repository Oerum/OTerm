use std::path::PathBuf;
use crate::process::git_program;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeConflictFile {
    pub file_path: String,
    pub our_content: String,
    pub their_content: String,
    pub base_content: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictBlock {
    pub ours: String,
    pub base: Option<String>,
    pub theirs: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFile {
    pub sections: Vec<ConflictSection>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictSection {
    pub is_conflict: bool,
    pub content: String,
    pub conflict_block: Option<ConflictBlock>,
}

pub fn parse_conflict_markers(repo_root: String, file_path: String) -> Result<ConflictFile, String> {
    if PathBuf::from(&file_path).is_absolute() || PathBuf::from(&file_path).components().any(|x| matches!(x, std::path::Component::ParentDir)) {
        return Err("Path traversal detected".to_string());
    }
    let path = PathBuf::from(repo_root).join(file_path);
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    
    let mut sections = Vec::new();
    let mut current_normal = String::new();
    let mut ours = String::new();
    let mut base = None;
    let mut theirs = String::new();
    let mut conflict_state = 0; // 0=none, 1=ours, 2=base, 3=theirs

    for line in content.lines() {
        if line.starts_with("<<<<<<< ") {
            if !current_normal.is_empty() {
                sections.push(ConflictSection {
                    is_conflict: false,
                    content: current_normal.clone(),
                    conflict_block: None,
                });
                current_normal.clear();
            }
            conflict_state = 1;
            ours.clear();
            base = None;
            theirs.clear();
        } else if line.starts_with("||||||| ") {
            conflict_state = 2;
            base = Some(String::new());
        } else if line.starts_with("=======") {
            conflict_state = 3;
        } else if line.starts_with(">>>>>>> ") {
            sections.push(ConflictSection {
                is_conflict: true,
                content: String::new(),
                conflict_block: Some(ConflictBlock {
                    ours: ours.clone(),
                    base: base.clone(),
                    theirs: theirs.clone(),
                }),
            });
            conflict_state = 0;
        } else {
            match conflict_state {
                0 => { current_normal.push_str(line); current_normal.push('\n'); },
                1 => { ours.push_str(line); ours.push('\n'); },
                2 => { base.as_mut().unwrap().push_str(line); base.as_mut().unwrap().push('\n'); },
                3 => { theirs.push_str(line); theirs.push('\n'); },
                _ => {}
            }
        }
    }
    if !current_normal.is_empty() {
        sections.push(ConflictSection {
            is_conflict: false,
            content: current_normal,
            conflict_block: None,
        });
    }

    Ok(ConflictFile { sections })
}

pub fn resolve_conflict(repo_root: String, file_path: String, resolved_content: String) -> Result<(), String> {
    if PathBuf::from(&file_path).is_absolute() || PathBuf::from(&file_path).components().any(|x| matches!(x, std::path::Component::ParentDir)) {
        return Err("Path traversal detected".to_string());
    }
    let path = PathBuf::from(repo_root).join(file_path);
    std::fs::write(path, resolved_content).map_err(|e| e.to_string())
}

pub fn get_merge_conflicts(repo_root: String) -> Result<Vec<MergeConflictFile>, String> {
    let mut cmd = std::process::Command::new(git_program());
    cmd.current_dir(&repo_root);
    cmd.arg("diff").arg("--name-only").arg("--diff-filter=U");
    
    let out = cmd.output().map_err(|e| e.to_string())?;
    let files_str = String::from_utf8_lossy(&out.stdout);
    
    let mut conflicts = Vec::new();
    for file_path in files_str.lines() {
        let file_path = file_path.trim().to_string();
        if file_path.is_empty() { continue; }
        
        let path = PathBuf::from(&repo_root).join(&file_path);
        let base_content = std::fs::read_to_string(&path).unwrap_or_default();
        
        if let Ok(parsed) = parse_conflict_markers(repo_root.clone(), file_path.clone()) {
            let mut our_content = String::new();
            let mut their_content = String::new();
            for section in parsed.sections {
                if section.is_conflict {
                    let block = section.conflict_block.unwrap();
                    our_content.push_str(&block.ours);
                    their_content.push_str(&block.theirs);
                } else {
                    our_content.push_str(&section.content);
                    their_content.push_str(&section.content);
                }
            }
            conflicts.push(MergeConflictFile {
                file_path,
                our_content,
                their_content,
                base_content,
            });
        }
    }
    
    Ok(conflicts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_conflict_markers() {
        let dir = std::env::temp_dir().join(format!("merge_test_{}", std::time::UNIX_EPOCH.elapsed().unwrap().as_nanos()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("test.txt"), "start\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\nend\n").unwrap();

        let parsed = parse_conflict_markers(dir.to_string_lossy().into_owned(), "test.txt".into()).unwrap();
        assert_eq!(parsed.sections.len(), 3);
        assert!(parsed.sections[1].is_conflict);
        let block = parsed.sections[1].conflict_block.as_ref().unwrap();
        assert_eq!(block.ours.trim(), "ours");
        assert_eq!(block.theirs.trim(), "theirs");
    }
}
