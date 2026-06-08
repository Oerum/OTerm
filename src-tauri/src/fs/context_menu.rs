use std::path::Path;

#[cfg(windows)]
pub fn show_shell_context_menu(
    path: &Path,
    x: i32,
    y: i32,
    owner: Option<isize>,
) -> Result<(), String> {
    use win_context_menu::{init_com, ContextMenu, ShellItems};

    let _com = init_com().map_err(|err| err.to_string())?;
    let path_str = path.to_string_lossy();
    let items = ShellItems::from_path(path_str.as_ref()).map_err(|err| err.to_string())?;

    let mut menu = ContextMenu::new(items).map_err(|err| err.to_string())?;
    if let Some(hwnd) = owner {
        menu = menu.owner(hwnd);
    }

    if let Some(selected) = menu.show_at(x, y).map_err(|err| err.to_string())? {
        selected.execute().map_err(|err| err.to_string())?;
    }

    Ok(())
}

#[cfg(not(windows))]
pub fn show_shell_context_menu(
    _path: &Path,
    _x: i32,
    _y: i32,
    _owner: Option<isize>,
) -> Result<(), String> {
    Err("Native shell context menu is only available on Windows".to_string())
}
