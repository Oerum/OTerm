use std::path::{Path, PathBuf};

use windows::core::HSTRING;
use windows::Data::Xml::Dom::XmlDocument;
use windows::UI::Notifications::{ToastNotification, ToastNotificationManager};
use windows_registry::CURRENT_USER;

use crate::platform::icon::{icon_display_path, toast_file_uri, xml_escape, NotificationAssets};

const START_MENU_SHORTCUT: &str = "OTerm.lnk";

pub struct ToastIdentity {
    pub app_id: String,
    pub display_name: String,
    pub assets: NotificationAssets,
    pub exe_path: PathBuf,
}

pub fn init(identity: &ToastIdentity) -> Result<(), String> {
    register_process_aumid(&identity.app_id)?;
    register_aumid_branding(identity)?;
    if let Err(error) = ensure_start_menu_shortcut(identity) {
        eprintln!("oterm: start menu shortcut for toast branding failed: {error}");
    }
    Ok(())
}

pub fn send(app_id: &str, title: &str, body: &str, icon_path: &Path) -> Result<(), String> {
    let image = if icon_path.is_file() {
        format!(
            r#"<image placement="appLogoOverride" src="{}" alt="OTerm" />"#,
            toast_file_uri(icon_path)
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
    doc.LoadXml(&HSTRING::from(xml)).map_err(|e| e.to_string())?;
    let notification =
        ToastNotification::CreateToastNotification(&doc).map_err(|e| e.to_string())?;
    let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_id))
        .map_err(|e| e.to_string())?;
    notifier
        .Show(&notification)
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn register_process_aumid(app_id: &str) -> Result<(), String> {
    use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

    let id = HSTRING::from(app_id);
    unsafe { SetCurrentProcessExplicitAppUserModelID(&id) }.map_err(|e| e.to_string())
}

fn register_aumid_branding(identity: &ToastIdentity) -> Result<(), String> {
    let icon = identity
        .assets
        .toast_icon
        .canonicalize()
        .unwrap_or_else(|_| identity.assets.toast_icon.clone());

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
    key.set_string("IconUri", &toast_file_uri(&icon))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn start_menu_shortcut_path() -> Result<PathBuf, String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    Ok(PathBuf::from(app_data)
        .join(r"Microsoft\Windows\Start Menu\Programs")
        .join(START_MENU_SHORTCUT))
}

fn ensure_start_menu_shortcut(identity: &ToastIdentity) -> Result<(), String> {
    let shortcut = start_menu_shortcut_path()?;
    let exe = identity
        .exe_path
        .canonicalize()
        .unwrap_or_else(|_| identity.exe_path.clone());
    write_start_menu_shortcut(&shortcut, identity, &exe)
}

fn write_start_menu_shortcut(
    shortcut: &Path,
    identity: &ToastIdentity,
    exe: &Path,
) -> Result<(), String> {
    use windows::core::{Interface, HSTRING};
    use windows::Win32::Storage::EnhancedStorage::PKEY_AppUserModel_ID;
    use windows::Win32::System::Com::StructuredStorage::PropVariantClear;
    use windows::Win32::System::Com::{
        CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER,
    };
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

        let icon = identity
            .assets
            .app_icon
            .canonicalize()
            .unwrap_or_else(|_| identity.assets.app_icon.clone());
        let icon_location = format!("{},0", icon_display_path(&icon));
        shell_link
            .SetIconLocation(&HSTRING::from(icon_location), 0)
            .map_err(|e| e.to_string())?;

        let property_store: IPropertyStore = shell_link.cast().map_err(|e| e.to_string())?;
        let (mut prop, _app_id_wide) = prop_variant_from_str(&identity.app_id);
        property_store
            .SetValue(&PKEY_AppUserModel_ID, &prop)
            .map_err(|e| e.to_string())?;
        property_store.Commit().map_err(|e| e.to_string())?;
        PropVariantClear(&mut prop).ok();

        let persist: IPersistFile = shell_link.cast().map_err(|e| e.to_string())?;
        persist
            .Save(&HSTRING::from(shortcut), true)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn prop_variant_from_str(value: &str) -> (windows::Win32::System::Com::StructuredStorage::PROPVARIANT, Vec<u16>) {
    use windows::core::PWSTR;
    use windows::Win32::System::Com::StructuredStorage::{
        PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0,
    };
    use windows::Win32::System::Variant::VARENUM;

    let mut wide: Vec<u16> = value.encode_utf16().chain([0]).collect();
    let prop = PROPVARIANT {
        Anonymous: PROPVARIANT_0 {
            Anonymous: core::mem::ManuallyDrop::new(PROPVARIANT_0_0 {
                vt: VARENUM(31u16),
                wReserved1: 0,
                wReserved2: 0,
                wReserved3: 0,
                Anonymous: PROPVARIANT_0_0_0 {
                    pwszVal: PWSTR(wide.as_mut_ptr()),
                },
            }),
        },
    };
    (prop, wide)
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
