use std::fs;
use std::path::{Path, PathBuf};

const ICON_DIR: &str = "icons";
const CACHE_DIR_NAME: &str = "OTerm";
const TOAST_ICON_NAME: &str = "toast.png";
const APP_ICON_NAME: &str = "app.ico";

#[cfg(windows)]
const NOTIFICATION_ICON_NAMES: &[&str] =
    &["128x128@2x.png", "icon.png", "128x128.png", "icon.ico"];

#[cfg(windows)]
const BRANDING_ICON_NAMES: &[&str] = &["icon.ico", "128x128@2x.png", "icon.png"];

#[cfg(target_os = "macos")]
const NOTIFICATION_ICON_NAMES: &[&str] = &["icon.icns", "icon.png", "128x128@2x.png"];

#[cfg(target_os = "linux")]
const NOTIFICATION_ICON_NAMES: &[&str] = &["128x128@2x.png", "icon.png", "128x128.png"];

pub struct NotificationAssets {
    pub toast_icon: PathBuf,
    pub app_icon: PathBuf,
}

pub fn resolve_notification_icon(exe: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(assets) = prepare_notification_assets(exe) {
            return assets.toast_icon;
        }
    }
    resolve_from_names(exe, NOTIFICATION_ICON_NAMES)
}
#[cfg(windows)]
pub fn prepare_notification_assets(exe: &Path) -> Result<NotificationAssets, String> {
    let source_png = resolve_from_names(exe, NOTIFICATION_ICON_NAMES);
    let source_ico = resolve_from_names(exe, BRANDING_ICON_NAMES);
    let cache_dir = notification_cache_dir()?;
    let toast_icon = cache_dir.join(TOAST_ICON_NAME);
    let app_icon = cache_dir.join(APP_ICON_NAME);
    copy_if_newer(&source_png, &toast_icon)?;
    copy_if_newer(&source_ico, &app_icon)?;
    Ok(NotificationAssets {
        toast_icon,
        app_icon,
    })
}

#[cfg(windows)]
pub fn toast_file_uri(path: &Path) -> String {
    let path = path
        .canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .display()
        .to_string()
        .replace('\\', "/");
    format!("file:///{}", xml_escape(&path))
}

fn resolve_from_names(exe: &Path, names: &[&str]) -> PathBuf {
    let manifest_icons = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(ICON_DIR);
    let mut candidates = Vec::new();

    if let Some(parent) = exe.parent() {
        for name in names {
            candidates.push(parent.join(format!("../../{ICON_DIR}/{name}")));
            candidates.push(parent.join(format!("{ICON_DIR}/{name}")));
        }
    }

    for name in names {
        candidates.push(manifest_icons.join(name));
    }

    candidates
        .into_iter()
        .filter_map(|path| path.canonicalize().ok())
        .find(|path| path.is_file())
        .unwrap_or_else(|| manifest_icons.join(names[0]))
}

pub fn icon_display_path(icon: &Path) -> String {
    icon.canonicalize()
        .unwrap_or_else(|_| icon.to_path_buf())
        .display()
        .to_string()
}

#[cfg(windows)]
fn notification_cache_dir() -> Result<PathBuf, String> {
    let base = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    Ok(PathBuf::from(base).join(CACHE_DIR_NAME))
}

#[cfg(windows)]
fn copy_if_newer(source: &Path, dest: &Path) -> Result<(), String> {
    if !source.is_file() {
        return Err(format!("missing icon source: {}", source.display()));
    }

    let needs_copy = match dest.metadata() {
        Ok(dest_meta) => match source.metadata() {
            Ok(source_meta) => source_meta
                .modified()
                .ok()
                .zip(dest_meta.modified().ok())
                .map(|(source_modified, dest_modified)| source_modified > dest_modified)
                .unwrap_or(true),
            Err(_) => true,
        },
        Err(_) => true,
    };

    if !needs_copy {
        return Ok(());
    }

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(source, dest).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
