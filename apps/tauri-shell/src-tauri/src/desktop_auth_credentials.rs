use crate::secret_store::{delete_secret, read_secret_value, store_secret, SecretDescriptor};
use std::env;
use std::fs;
use std::path::PathBuf;

const AUTH_SCOPE: &str = "desktop_runtime";
const AUTH_TOKEN_SECRET_ID: &str = "desktop_auth__token";
const AUTH_REFRESH_TOKEN_SECRET_ID: &str = "desktop_auth__refresh_token";
const AUTH_USER_SECRET_ID: &str = "desktop_auth__user";

fn desktop_auth_root_dir() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Failed to resolve home directory for desktop auth storage".to_string())?;
    let root = home_dir.join("SmartAIHub").join("DesktopAuth");
    fs::create_dir_all(&root)
        .map_err(|error| format!("Failed to create desktop auth storage directory: {error}"))?;
    Ok(root)
}

fn write_secret(secret_id: &str, secret_value: &str) -> Result<(), String> {
    let base_dir = desktop_auth_root_dir()?;
    let metadata = store_secret(
        &base_dir,
        SecretDescriptor {
            secret_id: secret_id.to_string(),
            scope: AUTH_SCOPE.to_string(),
            secret_value: secret_value.to_string(),
        },
    )?;

    if metadata.storage_backend == "file_store" {
        let message = format!(
            "Desktop auth secret '{secret_id}' is stored with file_store fallback. Install an OS keychain for stronger protection."
        );
        if matches!(
            env::var("SMARTSPEC_REQUIRE_SECURE_DESKTOP_AUTH_STORAGE")
                .ok()
                .as_deref()
                .map(|value| value.trim().to_ascii_lowercase()),
            Some(value) if matches!(value.as_str(), "1" | "true" | "yes" | "on")
        ) {
            let _ = delete_secret(&base_dir, secret_id);
            return Err(message);
        }
        eprintln!("[Desktop Auth] WARNING: {message}");
    }

    Ok(())
}

fn read_secret(secret_id: &str) -> Option<String> {
    let base_dir = desktop_auth_root_dir().ok()?;
    read_secret_value(&base_dir, secret_id)
        .ok()
        .and_then(|value| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
}

fn delete_secret_value(secret_id: &str) {
    if let Ok(base_dir) = desktop_auth_root_dir() {
        let _ = delete_secret(&base_dir, secret_id);
    }
}

#[tauri::command]
pub async fn get_auth_token() -> Result<Option<String>, String> {
    Ok(read_secret(AUTH_TOKEN_SECRET_ID))
}

#[tauri::command]
pub async fn set_auth_token(token: String) -> Result<(), String> {
    let normalized = token.trim();
    if normalized.is_empty() {
        return Err("auth token cannot be empty".into());
    }
    write_secret(AUTH_TOKEN_SECRET_ID, normalized)
}

#[tauri::command]
pub async fn get_auth_refresh_token() -> Result<Option<String>, String> {
    Ok(read_secret(AUTH_REFRESH_TOKEN_SECRET_ID))
}

#[tauri::command]
pub async fn set_auth_refresh_token(refresh_token: String) -> Result<(), String> {
    let normalized = refresh_token.trim();
    if normalized.is_empty() {
        return Err("auth refresh token cannot be empty".into());
    }
    write_secret(AUTH_REFRESH_TOKEN_SECRET_ID, normalized)
}

#[tauri::command]
pub async fn get_user_data() -> Result<Option<String>, String> {
    Ok(read_secret(AUTH_USER_SECRET_ID))
}

#[tauri::command]
pub async fn set_user_data(user_json: String) -> Result<(), String> {
    let normalized = user_json.trim();
    if normalized.is_empty() {
        return Err("user data cannot be empty".into());
    }
    write_secret(AUTH_USER_SECRET_ID, normalized)
}

#[tauri::command]
pub async fn clear_all_credentials() -> Result<(), String> {
    delete_secret_value(AUTH_TOKEN_SECRET_ID);
    delete_secret_value(AUTH_REFRESH_TOKEN_SECRET_ID);
    delete_secret_value(AUTH_USER_SECRET_ID);
    Ok(())
}

#[tauri::command]
pub async fn is_authenticated() -> Result<bool, String> {
    Ok(read_secret(AUTH_TOKEN_SECRET_ID).is_some() || read_secret(AUTH_REFRESH_TOKEN_SECRET_ID).is_some())
}
