// Secure Store - Secure credential and token storage
//
// Provides:
// - Secure token storage using system keyring
// - Auth token management
// - API key management
// - Encrypted local storage fallback

use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const SERVICE: &str = "smartspecpro";

// ============================================
// Token Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredCredential {
    pub key: String,
    pub value: String,
    pub created_at: i64,
    pub expires_at: Option<i64>,
}

// ============================================
// Proxy Token Commands (existing)
// ============================================

#[tauri::command]
pub fn set_proxy_token(token: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE, "proxy_token").map_err(|e| e.to_string())?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_proxy_token() -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE, "proxy_token").map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn delete_proxy_token() -> Result<(), String> {
    let entry = Entry::new(SERVICE, "proxy_token").map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ============================================
// Auth Token Commands (CRIT-002 fix)
// ============================================

#[tauri::command]
pub fn set_auth_token(token: String) -> Result<(), String> {
    if token.is_empty() {
        return Err("Token cannot be empty".to_string());
    }
    let entry = Entry::new(SERVICE, "auth_token").map_err(|e| e.to_string())?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_auth_token() -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE, "auth_token").map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn delete_auth_token() -> Result<(), String> {
    let entry = Entry::new(SERVICE, "auth_token").map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn set_refresh_token(token: String) -> Result<(), String> {
    if token.is_empty() {
        return Err("Token cannot be empty".to_string());
    }
    let entry = Entry::new(SERVICE, "refresh_token").map_err(|e| e.to_string())?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_refresh_token() -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE, "refresh_token").map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn delete_refresh_token() -> Result<(), String> {
    let entry = Entry::new(SERVICE, "refresh_token").map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ============================================
// API Key Commands (CRIT-003 fix)
// ============================================

#[tauri::command]
pub fn set_api_key(provider: String, api_key: String) -> Result<(), String> {
    if provider.is_empty() || api_key.is_empty() {
        return Err("Provider and API key cannot be empty".to_string());
    }
    
    // Validate provider name
    let valid_providers = ["openrouter", "openai", "anthropic", "deepseek", "google"];
    if !valid_providers.contains(&provider.to_lowercase().as_str()) {
        return Err(format!("Invalid provider: {}", provider));
    }
    
    let key_name = format!("api_key_{}", provider.to_lowercase());
    let entry = Entry::new(SERVICE, &key_name).map_err(|e| e.to_string())?;
    entry.set_password(&api_key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_api_key(provider: String) -> Result<Option<String>, String> {
    let key_name = format!("api_key_{}", provider.to_lowercase());
    let entry = Entry::new(SERVICE, &key_name).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn delete_api_key(provider: String) -> Result<(), String> {
    let key_name = format!("api_key_{}", provider.to_lowercase());
    let entry = Entry::new(SERVICE, &key_name).map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn list_stored_api_keys() -> Result<Vec<String>, String> {
    let providers = ["openrouter", "openai", "anthropic", "deepseek", "google"];
    let mut stored = Vec::new();
    
    for provider in providers {
        let key_name = format!("api_key_{}", provider);
        let entry = Entry::new(SERVICE, &key_name).map_err(|e| e.to_string())?;
        if entry.get_password().is_ok() {
            stored.push(provider.to_string());
        }
    }
    
    Ok(stored)
}

// ============================================
// User Data Commands
// ============================================

#[tauri::command]
pub fn set_user_data(user_json: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE, "user_data").map_err(|e| e.to_string())?;
    entry.set_password(&user_json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_user_data() -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE, "user_data").map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn delete_user_data() -> Result<(), String> {
    let entry = Entry::new(SERVICE, "user_data").map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ============================================
// Clear All Credentials (Logout)
// ============================================

#[tauri::command]
pub fn clear_all_credentials() -> Result<(), String> {
    let keys = [
        "auth_token",
        "refresh_token",
        "user_data",
        "proxy_token",
        "api_key_openrouter",
        "api_key_openai",
        "api_key_anthropic",
        "api_key_deepseek",
        "api_key_google",
    ];
    
    for key in keys {
        let entry = Entry::new(SERVICE, key).map_err(|e| e.to_string())?;
        let _ = entry.delete_password(); // Ignore errors for non-existent keys
    }
    
    Ok(())
}

// ============================================
// Check if authenticated
// ============================================

#[tauri::command]
pub fn is_authenticated() -> Result<bool, String> {
    let entry = Entry::new(SERVICE, "auth_token").map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(token) => Ok(!token.is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}
