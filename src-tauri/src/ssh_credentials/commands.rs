use super::{delete_secret, get_secret, identity_passphrase_key, password_key, set_secret};

#[tauri::command]
pub fn ssh_cred_set(id: String, secret: String) -> Result<(), String> {
    set_secret(&id, &secret)
}

#[tauri::command]
pub fn ssh_cred_get(id: String) -> Result<Option<String>, String> {
    get_secret(&id)
}

#[tauri::command]
pub fn ssh_cred_delete(id: String) -> Result<(), String> {
    delete_secret(&id)
}

#[tauri::command]
pub fn ssh_cred_password_key(endpoint_id: String) -> String {
    password_key(&endpoint_id)
}

#[tauri::command]
pub fn ssh_cred_identity_passphrase_key(identity_id: String) -> String {
    identity_passphrase_key(&identity_id)
}
