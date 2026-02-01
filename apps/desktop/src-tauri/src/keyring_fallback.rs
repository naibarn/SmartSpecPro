// Keyring Fallback Module
//
// RISK-012 FIX: Provides fallback storage when OS keyring is unavailable
//
// Storage priority:
// 1. OS Keyring (most secure)
// 2. Encrypted file storage (fallback)
//
// The fallback uses AES-256-GCM encryption with a key derived from
// machine-specific identifiers.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use keyring::Entry;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const SERVICE: &str = "smartspecpro";
const FALLBACK_FILE: &str = "secure_store.enc";
const NONCE_SIZE: usize = 12;

// ============================================
// Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FallbackStore {
    version: u32,
    entries: HashMap<String, String>,
    created_at: i64,
    updated_at: i64,
}

impl Default for FallbackStore {
    fn default() -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            version: 1,
            entries: HashMap::new(),
            created_at: now,
            updated_at: now,
        }
    }
}

#[derive(Debug)]
pub enum StorageBackend {
    Keyring,
    EncryptedFile,
}

// ============================================
// Secure Storage with Fallback
// ============================================

pub struct SecureStorage {
    backend: StorageBackend,
    fallback_path: PathBuf,
    encryption_key: [u8; 32],
}

impl SecureStorage {
    /// Create a new SecureStorage instance
    /// Automatically detects available backend
    pub fn new() -> Result<Self, String> {
        let fallback_path = Self::get_fallback_path()?;
        let encryption_key = Self::derive_encryption_key()?;
        
        // Test if keyring is available
        let backend = if Self::test_keyring() {
            StorageBackend::Keyring
        } else {
            log::warn!("OS keyring unavailable, using encrypted file fallback");
            StorageBackend::EncryptedFile
        };
        
        Ok(Self {
            backend,
            fallback_path,
            encryption_key,
        })
    }
    
    /// Test if keyring is available
    fn test_keyring() -> bool {
        let test_entry = Entry::new(SERVICE, "__keyring_test__");
        match test_entry {
            Ok(entry) => {
                // Try to set and delete a test value
                let test_result = entry.set_password("test")
                    .and_then(|_| entry.delete_password());
                test_result.is_ok()
            }
            Err(_) => false,
        }
    }
    
    /// Get the fallback file path
    fn get_fallback_path() -> Result<PathBuf, String> {
        let data_dir = dirs::data_local_dir()
            .ok_or("Could not determine local data directory")?;
        let app_dir = data_dir.join("smartspecpro");
        
        // Create directory if it doesn't exist
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create app directory: {}", e))?;
        
        Ok(app_dir.join(FALLBACK_FILE))
    }
    
    /// Derive encryption key from machine-specific data
    fn derive_encryption_key() -> Result<[u8; 32], String> {
        let mut hasher = Sha256::new();
        
        // Add machine-specific identifiers
        if let Some(hostname) = hostname::get().ok().and_then(|h| h.into_string().ok()) {
            hasher.update(hostname.as_bytes());
        }
        
        // Add username
        if let Ok(username) = std::env::var("USER").or_else(|_| std::env::var("USERNAME")) {
            hasher.update(username.as_bytes());
        }
        
        // Add a constant salt
        hasher.update(b"smartspecpro_secure_storage_v1");
        
        // Add home directory path for additional uniqueness
        if let Some(home) = dirs::home_dir() {
            hasher.update(home.to_string_lossy().as_bytes());
        }
        
        let result = hasher.finalize();
        let mut key = [0u8; 32];
        key.copy_from_slice(&result);
        
        Ok(key)
    }
    
    /// Store a value securely
    pub fn set(&self, key: &str, value: &str) -> Result<(), String> {
        match &self.backend {
            StorageBackend::Keyring => self.set_keyring(key, value),
            StorageBackend::EncryptedFile => self.set_file(key, value),
        }
    }
    
    /// Retrieve a value
    pub fn get(&self, key: &str) -> Result<Option<String>, String> {
        match &self.backend {
            StorageBackend::Keyring => self.get_keyring(key),
            StorageBackend::EncryptedFile => self.get_file(key),
        }
    }
    
    /// Delete a value
    pub fn delete(&self, key: &str) -> Result<(), String> {
        match &self.backend {
            StorageBackend::Keyring => self.delete_keyring(key),
            StorageBackend::EncryptedFile => self.delete_file(key),
        }
    }
    
    /// Check if keyring is being used
    pub fn is_keyring_available(&self) -> bool {
        matches!(self.backend, StorageBackend::Keyring)
    }
    
    /// Get current backend type
    pub fn get_backend(&self) -> &StorageBackend {
        &self.backend
    }
    
    // ============================================
    // Keyring Operations
    // ============================================
    
    fn set_keyring(&self, key: &str, value: &str) -> Result<(), String> {
        let entry = Entry::new(SERVICE, key).map_err(|e| e.to_string())?;
        entry.set_password(value).map_err(|e| e.to_string())
    }
    
    fn get_keyring(&self, key: &str) -> Result<Option<String>, String> {
        let entry = Entry::new(SERVICE, key).map_err(|e| e.to_string())?;
        match entry.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    
    fn delete_keyring(&self, key: &str) -> Result<(), String> {
        let entry = Entry::new(SERVICE, key).map_err(|e| e.to_string())?;
        match entry.delete_password() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
    
    // ============================================
    // Encrypted File Operations
    // ============================================
    
    fn set_file(&self, key: &str, value: &str) -> Result<(), String> {
        let mut store = self.load_store()?;
        store.entries.insert(key.to_string(), value.to_string());
        store.updated_at = chrono::Utc::now().timestamp();
        self.save_store(&store)
    }
    
    fn get_file(&self, key: &str) -> Result<Option<String>, String> {
        let store = self.load_store()?;
        Ok(store.entries.get(key).cloned())
    }
    
    fn delete_file(&self, key: &str) -> Result<(), String> {
        let mut store = self.load_store()?;
        store.entries.remove(key);
        store.updated_at = chrono::Utc::now().timestamp();
        self.save_store(&store)
    }
    
    fn load_store(&self) -> Result<FallbackStore, String> {
        if !self.fallback_path.exists() {
            return Ok(FallbackStore::default());
        }
        
        let encrypted = fs::read(&self.fallback_path)
            .map_err(|e| format!("Failed to read store file: {}", e))?;
        
        if encrypted.len() < NONCE_SIZE {
            return Err("Invalid store file format".to_string());
        }
        
        // Extract nonce and ciphertext
        let (nonce_bytes, ciphertext) = encrypted.split_at(NONCE_SIZE);
        let nonce = Nonce::from_slice(nonce_bytes);
        
        // Decrypt
        let cipher = Aes256Gcm::new_from_slice(&self.encryption_key)
            .map_err(|e| format!("Failed to create cipher: {}", e))?;
        
        let plaintext = cipher.decrypt(nonce, ciphertext)
            .map_err(|_| "Failed to decrypt store (key may have changed)")?;
        
        // Deserialize
        serde_json::from_slice(&plaintext)
            .map_err(|e| format!("Failed to parse store: {}", e))
    }
    
    fn save_store(&self, store: &FallbackStore) -> Result<(), String> {
        // Serialize
        let plaintext = serde_json::to_vec(store)
            .map_err(|e| format!("Failed to serialize store: {}", e))?;
        
        // Generate random nonce
        let mut nonce_bytes = [0u8; NONCE_SIZE];
        rand::thread_rng().fill(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        
        // Encrypt
        let cipher = Aes256Gcm::new_from_slice(&self.encryption_key)
            .map_err(|e| format!("Failed to create cipher: {}", e))?;
        
        let ciphertext = cipher.encrypt(nonce, plaintext.as_ref())
            .map_err(|e| format!("Failed to encrypt store: {}", e))?;
        
        // Combine nonce and ciphertext
        let mut encrypted = nonce_bytes.to_vec();
        encrypted.extend(ciphertext);
        
        // Write to file
        fs::write(&self.fallback_path, encrypted)
            .map_err(|e| format!("Failed to write store file: {}", e))
    }
    
    /// List all stored keys
    pub fn list_keys(&self) -> Result<Vec<String>, String> {
        match &self.backend {
            StorageBackend::Keyring => {
                // Keyring doesn't support listing, return known keys
                Ok(vec![
                    "auth_token".to_string(),
                    "refresh_token".to_string(),
                    "proxy_token".to_string(),
                    "api_key_openrouter".to_string(),
                    "api_key_openai".to_string(),
                    "api_key_anthropic".to_string(),
                    "api_key_deepseek".to_string(),
                    "api_key_google".to_string(),
                ])
            }
            StorageBackend::EncryptedFile => {
                let store = self.load_store()?;
                Ok(store.entries.keys().cloned().collect())
            }
        }
    }
    
    /// Get count of stored credentials
    pub fn count(&self) -> Result<usize, String> {
        match &self.backend {
            StorageBackend::Keyring => {
                // Count by checking each known key
                let keys = self.list_keys()?;
                let mut count = 0;
                for key in keys {
                    if self.get(&key)?.is_some() {
                        count += 1;
                    }
                }
                Ok(count)
            }
            StorageBackend::EncryptedFile => {
                let store = self.load_store()?;
                Ok(store.entries.len())
            }
        }
    }
    
    /// Clear all stored credentials
    pub fn clear_all(&self) -> Result<(), String> {
        match &self.backend {
            StorageBackend::Keyring => {
                let keys = self.list_keys()?;
                for key in keys {
                    let _ = self.delete(&key);
                }
                Ok(())
            }
            StorageBackend::EncryptedFile => {
                let store = FallbackStore::default();
                self.save_store(&store)
            }
        }
    }
    
    /// Migrate from keyring to file or vice versa
    pub fn migrate_to(&self, target: StorageBackend) -> Result<(), String> {
        // This would require creating a new SecureStorage with the target backend
        // and copying all values. For now, just return an error.
        Err("Migration between backends not yet implemented".to_string())
    }
}

// ============================================
// Global Instance
// ============================================

use once_cell::sync::Lazy;
use std::sync::Mutex;

static SECURE_STORAGE: Lazy<Mutex<Option<SecureStorage>>> = Lazy::new(|| Mutex::new(None));

/// Initialize the global secure storage
pub fn init_secure_storage() -> Result<(), String> {
    let storage = SecureStorage::new()?;
    let mut guard = SECURE_STORAGE.lock().map_err(|e| e.to_string())?;
    *guard = Some(storage);
    Ok(())
}

/// Get the global secure storage instance
pub fn get_secure_storage() -> Result<std::sync::MutexGuard<'static, Option<SecureStorage>>, String> {
    SECURE_STORAGE.lock().map_err(|e| e.to_string())
}

// ============================================
// Tauri Commands
// ============================================

#[tauri::command]
pub fn secure_store_set(key: String, value: String) -> Result<(), String> {
    let guard = get_secure_storage()?;
    let storage = guard.as_ref().ok_or("Secure storage not initialized")?;
    storage.set(&key, &value)
}

#[tauri::command]
pub fn secure_store_get(key: String) -> Result<Option<String>, String> {
    let guard = get_secure_storage()?;
    let storage = guard.as_ref().ok_or("Secure storage not initialized")?;
    storage.get(&key)
}

#[tauri::command]
pub fn secure_store_delete(key: String) -> Result<(), String> {
    let guard = get_secure_storage()?;
    let storage = guard.as_ref().ok_or("Secure storage not initialized")?;
    storage.delete(&key)
}

#[tauri::command]
pub fn get_security_info() -> Result<SecurityInfo, String> {
    let guard = get_secure_storage()?;
    let storage = guard.as_ref().ok_or("Secure storage not initialized")?;
    
    Ok(SecurityInfo {
        keyring_available: storage.is_keyring_available(),
        credentials_count: storage.count()?,
        backend: match storage.get_backend() {
            StorageBackend::Keyring => "keyring".to_string(),
            StorageBackend::EncryptedFile => "encrypted_file".to_string(),
        },
    })
}

#[tauri::command]
pub fn clear_all_credentials() -> Result<(), String> {
    let guard = get_secure_storage()?;
    let storage = guard.as_ref().ok_or("Secure storage not initialized")?;
    storage.clear_all()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityInfo {
    pub keyring_available: bool,
    pub credentials_count: usize,
    pub backend: String,
}

// ============================================
// Tests
// ============================================

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_derive_encryption_key() {
        let key1 = SecureStorage::derive_encryption_key().unwrap();
        let key2 = SecureStorage::derive_encryption_key().unwrap();
        
        // Keys should be deterministic
        assert_eq!(key1, key2);
        
        // Key should be 32 bytes
        assert_eq!(key1.len(), 32);
    }
    
    #[test]
    fn test_fallback_store_default() {
        let store = FallbackStore::default();
        assert_eq!(store.version, 1);
        assert!(store.entries.is_empty());
    }
}
