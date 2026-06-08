use super::{resolve_git_status, GitStatus};

#[tauri::command]
pub fn git_status(path: Option<String>) -> Result<GitStatus, String> {
    resolve_git_status(path)
}

#[cfg(test)]
mod tests {
    use crate::git::read_git_status;
    use std::path::PathBuf;

    #[test]
    fn reads_repo_status_for_project_root() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let project_root = manifest.parent().expect("project root");
        let status = read_git_status(project_root);
        assert!(status.is_repo);
        assert!(status.branch.is_some());
    }
}
