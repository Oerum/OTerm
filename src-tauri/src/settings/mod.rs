pub mod commands;

use crate::fs::user_home;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

pub fn settings_dir() -> Result<PathBuf, String> {
    let home = user_home().ok_or_else(|| "Home directory not found".to_string())?;
    let dir = home.join(".oterm");
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

pub fn settings_path() -> Result<PathBuf, String> {
    Ok(settings_dir()?.join("settings.json"))
}

pub fn read_all() -> Result<HashMap<String, String>, String> {
    let path = settings_path()?;
    if !path.is_file() {
        return Ok(HashMap::new());
    }

    let content = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    if content.trim().is_empty() {
        return Ok(HashMap::new());
    }

    serde_json::from_str(&content).map_err(|err| err.to_string())
}

pub fn write_all(values: &HashMap<String, String>) -> Result<(), String> {
    let path = settings_path()?;
    let content = serde_json::to_string_pretty(values).map_err(|err| err.to_string())?;
    fs::write(path, content).map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, MutexGuard};

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn lock_test() -> MutexGuard<'static, ()> {
        TEST_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    #[test]
    fn settings_dir_is_under_home() {
        let _guard = lock_test();
        let home = user_home().expect("home");
        assert_eq!(settings_dir().unwrap(), home.join(".oterm"));
    }

    #[test]
    fn round_trips_settings_file() {
        let _guard = lock_test();
        let path = settings_path().unwrap();
        let backup = path.exists().then(|| fs::read_to_string(&path).unwrap());

        let mut values = HashMap::new();
        values.insert("oterm.defaultShellId".into(), "pwsh".into());
        write_all(&values).unwrap();

        let loaded = read_all().unwrap();
        assert_eq!(loaded.get("oterm.defaultShellId"), Some(&"pwsh".to_string()));

        if let Some(content) = backup {
            fs::write(path, content).unwrap();
        } else if path.exists() {
            fs::remove_file(path).unwrap();
        }
    }
}
