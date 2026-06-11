use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use super::{expand_path, user_home};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiClipboardSaveResult {
    pub absolute_path: String,
    pub prompt_reference: String,
}

pub fn save_gemini_clipboard_png(
    png_bytes: &[u8],
    project_root: &Path,
) -> Result<GeminiClipboardSaveResult, String> {
    if png_bytes.is_empty() {
        return Err("Clipboard image is empty".to_string());
    }

    let home = user_home().ok_or_else(|| "Home directory not found".to_string())?;
    let short_id = resolve_gemini_short_id(project_root, &home)?;
    let images_dir = home
        .join(".gemini")
        .join("tmp")
        .join(&short_id)
        .join("images");
    std::fs::create_dir_all(&images_dir).map_err(|err| err.to_string())?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_millis();
    let file_name = format!("clipboard-{timestamp}.png");
    let image_path = images_dir.join(&file_name);
    std::fs::write(&image_path, png_bytes).map_err(|err| err.to_string())?;

    let relative = relative_path(project_root, &image_path);
    let relative_str = format_relative_for_prompt(&relative);
    let prompt_reference = format!("@{relative_str} ");

    Ok(GeminiClipboardSaveResult {
        absolute_path: image_path.to_string_lossy().into_owned(),
        prompt_reference,
    })
}

fn resolve_gemini_short_id(project_root: &Path, home: &Path) -> Result<String, String> {
    let normalized_root = normalize_registry_path(project_root);
    let registry_path = home.join(".gemini").join("projects.json");
    if registry_path.is_file() {
        if let Ok(contents) = std::fs::read_to_string(&registry_path) {
            if let Ok(registry) = serde_json::from_str::<GeminiProjectsRegistry>(&contents) {
                if let Some(short_id) = registry.projects.get(&normalized_root) {
                    if !short_id.trim().is_empty() {
                        return Ok(short_id.clone());
                    }
                }
            }
        }
    }

    if let Some(short_id) = find_short_id_from_project_root_markers(home, project_root) {
        return Ok(short_id);
    }

    Ok(slugify(
        project_root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("project"),
    ))
}

fn find_short_id_from_project_root_markers(home: &Path, project_root: &Path) -> Option<String> {
    let tmp_dir = home.join(".gemini").join("tmp");
    let entries = std::fs::read_dir(&tmp_dir).ok()?;
    let target = normalize_registry_path(project_root);

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if !entry_path.is_dir() {
            continue;
        }
        let marker = entry_path.join(".project_root");
        if !marker.is_file() {
            continue;
        }
        let marker_contents = std::fs::read_to_string(&marker).ok()?;
        let marker_path = marker_contents.trim();
        if marker_path.is_empty() {
            continue;
        }
        let Ok(expanded) = expand_path(marker_path) else {
            continue;
        };
        if normalize_registry_path(&expanded) == target {
            return entry_path
                .file_name()
                .and_then(|name| name.to_str())
                .map(str::to_string);
        }
    }

    None
}

#[derive(Debug, serde::Deserialize)]
struct GeminiProjectsRegistry {
    #[serde(default)]
    projects: HashMap<String, String>,
}

fn normalize_registry_path(path: &Path) -> String {
    let resolved = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let normalized = resolved.to_string_lossy();
    #[cfg(windows)]
    {
        normalized.to_lowercase()
    }
    #[cfg(not(windows))]
    {
        normalized.into_owned()
    }
}

fn slugify(text: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for ch in text.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
            last_dash = false;
        } else if !last_dash {
            slug.push('-');
            last_dash = true;
        }
    }
    slug.trim_matches('-').to_string()
}

fn normalize_path_for_compare(path: &Path) -> PathBuf {
    let resolved = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let path_str = resolved.to_string_lossy();
    if let Some(stripped) = path_str.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        resolved
    }
}

fn components_equal(left: Component<'_>, right: Component<'_>) -> bool {
    match (left, right) {
        (Component::Prefix(left), Component::Prefix(right)) => left == right,
        (Component::RootDir, Component::RootDir) => true,
        (Component::CurDir, Component::CurDir) => true,
        (Component::ParentDir, Component::ParentDir) => true,
        (Component::Normal(left), Component::Normal(right)) => left
            .to_string_lossy()
            .eq_ignore_ascii_case(&right.to_string_lossy()),
        _ => false,
    }
}

pub fn relative_path(from: &Path, to: &Path) -> PathBuf {
    let from = normalize_path_for_compare(from);
    let to = normalize_path_for_compare(to);
    let from_parts: Vec<_> = from.components().collect();
    let to_parts: Vec<_> = to.components().collect();

    let mut shared = 0usize;
    while shared < from_parts.len()
        && shared < to_parts.len()
        && components_equal(from_parts[shared], to_parts[shared])
    {
        shared += 1;
    }

    let mut result = PathBuf::new();
    for part in &from_parts[shared..] {
        if matches!(part, Component::CurDir) {
            continue;
        }
        result.push("..");
    }
    for part in &to_parts[shared..] {
        if matches!(part, Component::CurDir) {
            continue;
        }
        result.push(part);
    }
    result
}

fn format_relative_for_prompt(path: &Path) -> String {
    let rendered = path.to_string_lossy();
    #[cfg(windows)]
    {
        rendered.replace('/', "\\")
    }
    #[cfg(not(windows))]
    {
        rendered.into_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_replaces_non_alnum_with_dashes() {
        assert_eq!(slugify("My Project!"), "my-project");
        assert_eq!(slugify("filip"), "filip");
    }

    #[test]
    fn relative_path_handles_nested_windows_paths() {
        let from = Path::new(r"C:\Users\Filip");
        let to = Path::new(r"C:\Users\Filip\.gemini\tmp\filip\images\clipboard-1.png");
        let relative = relative_path(from, to);
        assert_eq!(
            relative,
            Path::new(r".gemini\tmp\filip\images\clipboard-1.png")
        );
    }

    #[test]
    fn relative_path_walks_up_when_needed() {
        let from = Path::new(r"C:\Users\Filip\Desktop\oterm");
        let to = Path::new(r"C:\Users\Filip\.gemini\tmp\oterm\images\clipboard-1.png");
        let relative = relative_path(from, to);
        assert_eq!(
            relative,
            Path::new(r"..\..\.gemini\tmp\oterm\images\clipboard-1.png")
        );
    }
}
