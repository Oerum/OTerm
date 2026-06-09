use std::path::Path;

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::platform::icon::icon_display_path;

pub fn send(app: &AppHandle, title: &str, body: &str, icon_path: &Path) -> Result<(), String> {
    let mut builder = app.notification().builder().title(title).body(body);
    if icon_path.is_file() {
        builder = builder.icon(icon_display_path(icon_path));
    }
    builder.show().map_err(|e| e.to_string())
}
