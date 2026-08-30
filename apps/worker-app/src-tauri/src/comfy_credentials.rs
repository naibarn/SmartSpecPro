//! OS-backed credential storage for ComfyUI MCP profiles.
//!
//! The WebView only handles an opaque reference and a write-only secret field.
//! Values are resolved inside the native process immediately before MCP I/O;
//! they are never serialized into the profile file, job payload, logs, or
//! projection returned to React.

const SERVICE_NAME: &str = "SmartAIHub Worker ComfyUI MCP";

fn validate_reference(reference: &str) -> Result<&str, String> {
    let reference = reference.trim();
    let account = reference
        .strip_prefix("keychain:")
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "comfy_credential_ref_invalid".to_string())?;
    if account.len() > 240 || account.chars().any(|ch| ch.is_control()) {
        return Err("comfy_credential_ref_invalid".into());
    }
    Ok(account)
}

pub fn store(reference: &str, secret: &str) -> Result<(), String> {
    let account = validate_reference(reference)?;
    if secret.trim().is_empty() || secret.len() > 16 * 1024 || secret.chars().any(|ch| ch == '\n' || ch == '\r') {
        return Err("comfy_credential_value_invalid".into());
    }
    let entry = keyring::Entry::new(SERVICE_NAME, account)
        .map_err(|_| "comfy_secure_store_unavailable".to_string())?;
    entry.set_password(secret).map_err(|_| "comfy_secure_store_write_failed".to_string())
}

pub fn resolve(reference: &str) -> Result<String, String> {
    let account = validate_reference(reference)?;
    let entry = keyring::Entry::new(SERVICE_NAME, account)
        .map_err(|_| "comfy_secure_store_unavailable".to_string())?;
    entry.get_password().map_err(|_| "comfy_secure_credential_missing".to_string())
}

pub fn delete(reference: &str) -> Result<(), String> {
    let account = validate_reference(reference)?;
    let entry = keyring::Entry::new(SERVICE_NAME, account)
        .map_err(|_| "comfy_secure_store_unavailable".to_string())?;
    entry.delete_credential().map_err(|_| "comfy_secure_store_delete_failed".to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn references_are_opaque_keychain_identifiers() {
        assert!(super::validate_reference("keychain:comfy/cloud").is_ok());
        assert!(super::validate_reference("comfy/cloud").is_err());
        assert!(super::validate_reference("keychain:\nsecret").is_err());
    }
}
