use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSyncState {
    pub output: String,
    pub gui_state: String,
}

static SYNC_STATE: OnceLock<Mutex<HashMap<String, TerminalSyncState>>> = OnceLock::new();

fn get_state_map() -> &'static Mutex<HashMap<String, TerminalSyncState>> {
    SYNC_STATE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn capture_terminal_output(repo_root: String, output: String) -> Result<(), String> {
    let mut state = get_state_map().lock().unwrap();
    let entry = state.entry(repo_root).or_insert(TerminalSyncState {
        output: String::new(),
        gui_state: String::new(),
    });
    entry.output.push_str(&output);
    let max_len = 100_000;
    if entry.output.len() > max_len {
        let mut start = entry.output.len() - max_len;
        while !entry.output.is_char_boundary(start) {
            start += 1;
        }
        entry.output = entry.output.split_off(start);
    }
    Ok(())
}

pub fn update_gui_state(repo_root: String, gui_state: String) -> Result<(), String> {
    let mut state = get_state_map().lock().unwrap();
    let entry = state.entry(repo_root).or_insert(TerminalSyncState {
        output: String::new(),
        gui_state: String::new(),
    });
    entry.gui_state = gui_state;
    Ok(())
}

pub fn get_sync_state(repo_root: String) -> Result<TerminalSyncState, String> {
    let state = get_state_map().lock().unwrap();
    if let Some(entry) = state.get(&repo_root) {
        Ok(entry.clone())
    } else {
        Ok(TerminalSyncState {
            output: String::new(),
            gui_state: String::new(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_terminal_sync_state() {
        let repo = "test_repo".to_string();
        capture_terminal_output(repo.clone(), "hello".into()).unwrap();
        update_gui_state(repo.clone(), "gui".into()).unwrap();
        
        let state = get_sync_state(repo).unwrap();
        assert!(state.output.contains("hello"));
        assert_eq!(state.gui_state, "gui");
    }
}
