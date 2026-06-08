use super::{read_all, settings_dir, write_all};
use std::collections::HashMap;

#[tauri::command]
pub fn settings_get(key: String) -> Result<Option<String>, String> {
    Ok(read_all()?.get(&key).cloned())
}

#[tauri::command]
pub fn settings_set(key: String, value: String) -> Result<(), String> {
    let mut values = read_all()?;
    values.insert(key, value);
    write_all(&values)
}

#[tauri::command]
pub fn settings_get_all() -> Result<HashMap<String, String>, String> {
    read_all()
}

#[tauri::command]
pub fn settings_import(values: HashMap<String, String>) -> Result<u32, String> {
    let mut stored = read_all()?;
    let mut imported = 0u32;

    for (key, value) in values {
        if stored.contains_key(&key) {
            continue;
        }
        stored.insert(key, value);
        imported += 1;
    }

    if imported > 0 {
        write_all(&stored)?;
    }

    Ok(imported)
}

#[tauri::command]
pub fn settings_dir_path() -> Result<String, String> {
    Ok(settings_dir()?.to_string_lossy().into_owned())
}
