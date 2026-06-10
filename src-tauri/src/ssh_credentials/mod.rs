pub mod commands;

const SERVICE: &str = "oterm-ssh";

fn entry(id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, id).map_err(|err| format!("Keyring unavailable: {err}"))
}

pub fn set_secret(id: &str, secret: &str) -> Result<(), String> {
    entry(id)?
        .set_password(secret)
        .map_err(|err| format!("Could not store credential: {err}"))
}

pub fn get_secret(id: &str) -> Result<Option<String>, String> {
    match entry(id)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(format!("Could not read credential: {err}")),
    }
}

pub fn delete_secret(id: &str) -> Result<(), String> {
    match entry(id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(format!("Could not delete credential: {err}")),
    }
}

pub fn password_key(endpoint_id: &str) -> String {
    format!("host:{endpoint_id}:password")
}

pub fn identity_passphrase_key(identity_id: &str) -> String {
    format!("identity:{identity_id}:passphrase")
}
