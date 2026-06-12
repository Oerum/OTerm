use std::path::{Path, PathBuf};

use windows::core::HSTRING;
use windows::Data::Xml::Dom::XmlDocument;
use windows::UI::Notifications::{ToastNotification, ToastNotificationManager};
use windows_registry::CURRENT_USER;

use crate::platform::icon::{
    icon_display_path, resolve_branding_icon, toast_file_uri, xml_escape, NotificationAssets,
};

const LEGACY_APP_IDS: &[&str] = &["com.filip.oterm"];

const START_MENU_SHORTCUT: &str = "OTerm.lnk";

pub struct ToastIdentity {
    pub app_id: String,
    pub display_name: String,
    pub assets: NotificationAssets,
    pub exe_path: PathBuf,
}

pub fn init(identity: &ToastIdentity) -> Result<(), String> {
    cleanup_legacy_aumid_branding();
    register_process_aumid(&identity.app_id)?;
    register_aumid_branding(identity)?;
    if let Err(error) = ensure_start_menu_shortcut(identity) {
        eprintln!("oterm: start menu shortcut for toast branding failed: {error}");
    }
    Ok(())
}

pub fn send(app_id: &str, title: &str, body: &str, icon_path: &Path) -> Result<(), String> {
    let mut candidates = Vec::new();
    if let Some(current) = current_process_app_id() {
        candidates.push(current);
    }
    candidates.push(app_id.to_string());
    for legacy in LEGACY_APP_IDS {
        if !candidates.iter().any(|candidate| candidate == *legacy) {
            candidates.push((*legacy).to_string());
        }
    }

    let mut last_error = String::from("no toast app id candidates");
    for candidate in candidates {
        match send_with_app_id(&candidate, title, body, icon_path) {
            Ok(()) => return Ok(()),
            Err(error) => last_error = error,
        }
    }

    Err(last_error)
}

pub fn should_fallback(error: &str) -> bool {
    let lower = error.to_ascii_lowercase();
    lower.contains("unsupported")
        || lower.contains("not supported")
        || lower.contains("element not found")
        || lower.contains("0x80070490")
        || lower.contains("class not registered")
        || lower.contains("0x80040154")
}

fn send_with_app_id(
    app_id: &str,
    title: &str,
    body: &str,
    icon_path: &Path,
) -> Result<(), String> {
    let image = if icon_path.is_file() {
        format!(
            r#"<image placement="appLogoOverride" src="{}" alt="OTerm" />"#,
            xml_escape(&toast_file_uri(icon_path))
        )
    } else {
        String::new()
    };

    let xml = format!(
        r#"<toast>
            <visual>
                <binding template="ToastGeneric">
                    {image}
                    <text id="1">{}</text>
                    <text id="2">{}</text>
                </binding>
            </visual>
        </toast>"#,
        xml_escape(title),
        xml_escape(body)
    );

    let doc = XmlDocument::new().map_err(|e| e.to_string())?;
    doc.LoadXml(&HSTRING::from(xml))
        .map_err(|e| e.to_string())?;
    let notification =
        ToastNotification::CreateToastNotification(&doc).map_err(|e| e.to_string())?;
    let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_id))
        .map_err(|e| e.to_string())?;
    notifier.Show(&notification).map_err(|e| e.to_string())?;

    Ok(())
}

fn register_process_aumid(app_id: &str) -> Result<(), String> {
    use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

    let id = HSTRING::from(app_id);
    unsafe { SetCurrentProcessExplicitAppUserModelID(&id) }.map_err(|e| e.to_string())
}

fn current_process_app_id() -> Option<String> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::GetCurrentProcessExplicitAppUserModelID;

    unsafe {
        let app_id = GetCurrentProcessExplicitAppUserModelID().ok()?;
        if app_id.is_null() {
            return None;
        }

        let resolved = app_id.to_string().ok().filter(|value| !value.is_empty());
        CoTaskMemFree(Some(app_id.0 as _));
        resolved
    }
}

fn register_aumid_branding(identity: &ToastIdentity) -> Result<(), String> {
    // Taskbar / shell branding requires an .ico; PNG IconUri shows as a blank document icon.
    let icon = resolve_branding_icon(&identity.exe_path)
        .or_else(|| {
            identity
                .assets
                .app_icon
                .canonicalize()
                .ok()
                .filter(|path| path.is_file())
        })
        .ok_or_else(|| "no valid .ico available for taskbar branding".to_string())?;

    let key = CURRENT_USER
        .create(format!(
            r"SOFTWARE\Classes\AppUserModelId\{}",
            identity.app_id
        ))
        .map_err(|e| e.to_string())?;
    key.set_string("DisplayName", &identity.display_name)
        .map_err(|e| e.to_string())?;
    key.set_string("IconBackgroundColor", "0")
        .map_err(|e| e.to_string())?;
    key.set_string("IconUri", toast_file_uri(&icon))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn cleanup_legacy_aumid_branding() {
    for app_id in LEGACY_APP_IDS {
        let _ = CURRENT_USER.remove_tree(format!(r"SOFTWARE\Classes\AppUserModelId\{app_id}"));
    }
}

fn start_menu_shortcut_path() -> Result<PathBuf, String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    Ok(PathBuf::from(app_data)
        .join(r"Microsoft\Windows\Start Menu\Programs")
        .join(START_MENU_SHORTCUT))
}

fn ensure_start_menu_shortcut(identity: &ToastIdentity) -> Result<(), String> {
    let shortcut = start_menu_shortcut_path()?;
    write_start_menu_shortcut(&shortcut, identity, &identity.exe_path)
}

fn write_start_menu_shortcut(
    shortcut: &Path,
    identity: &ToastIdentity,
    exe: &Path,
) -> Result<(), String> {
    use windows::core::{Interface, HSTRING};
    use windows::Win32::Storage::EnhancedStorage::PKEY_AppUserModel_ID;
    use windows::Win32::System::Com::{CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER};
    use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

    unsafe {
        com_apartment()?;

        let shell_link: IShellLinkW =
            CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;

        shell_link
            .SetPath(&HSTRING::from(exe))
            .map_err(|e| e.to_string())?;
        shell_link
            .SetArguments(&HSTRING::new())
            .map_err(|e| e.to_string())?;
        shell_link
            .SetDescription(&HSTRING::from(&identity.display_name))
            .map_err(|e| e.to_string())?;

        let icon_location = format!("{},0", icon_display_path(exe));
        shell_link
            .SetIconLocation(&HSTRING::from(icon_location), 0)
            .map_err(|e| e.to_string())?;

        let property_store: IPropertyStore = shell_link.cast().map_err(|e| e.to_string())?;
        let mut prop = prop_variant_from_str(&identity.app_id)?;
        let set_err = property_store
            .SetValue(&PKEY_AppUserModel_ID, &prop)
            .map_err(|e| e.to_string());
        clear_prop_variant(&mut prop)?;
        set_err?;
        property_store.Commit().map_err(|e| e.to_string())?;

        let persist: IPersistFile = shell_link.cast().map_err(|e| e.to_string())?;
        persist
            .Save(&HSTRING::from(shortcut), true)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn prop_variant_from_str(
    value: &str,
) -> Result<windows::Win32::System::Com::StructuredStorage::PROPVARIANT, String> {
    use windows::core::PWSTR;
    use windows::Win32::System::Com::CoTaskMemAlloc;
    use windows::Win32::System::Com::StructuredStorage::{
        PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0,
    };
    use windows::Win32::System::Variant::VT_LPWSTR;

    let wide: Vec<u16> = value.encode_utf16().chain([0]).collect();
    let byte_len = wide.len() * std::mem::size_of::<u16>();
    let ptr = unsafe { CoTaskMemAlloc(byte_len) as *mut u16 };
    if ptr.is_null() {
        return Err("CoTaskMemAlloc failed".into());
    }
    unsafe {
        std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr, wide.len());
    }

    Ok(PROPVARIANT {
        Anonymous: PROPVARIANT_0 {
            Anonymous: core::mem::ManuallyDrop::new(PROPVARIANT_0_0 {
                vt: VT_LPWSTR,
                wReserved1: 0,
                wReserved2: 0,
                wReserved3: 0,
                Anonymous: PROPVARIANT_0_0_0 {
                    pwszVal: PWSTR(ptr as *mut _),
                },
            }),
        },
    })
}

fn clear_prop_variant(
    prop: &mut windows::Win32::System::Com::StructuredStorage::PROPVARIANT,
) -> Result<(), String> {
    use windows::Win32::System::Com::StructuredStorage::PropVariantClear;

    unsafe { PropVariantClear(prop as *mut _).map_err(|e| e.to_string()) }
}

fn com_apartment() -> Result<(), String> {
    use windows::core::HRESULT;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};

    const RPC_E_CHANGED_MODE: HRESULT = HRESULT(0x80010106_u32 as i32);

    let result = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if result.is_ok() || result == RPC_E_CHANGED_MODE {
        Ok(())
    } else {
        Err(result.to_string())
    }
}
