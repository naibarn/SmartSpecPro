use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::device_enrollment::generate_device_signing_keypair;
use crate::secret_store::{delete_secret, store_secret, SecretDescriptor, SecretMetadata};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceIdentityRecord {
    pub device_id: String,
    pub key_algorithm: String,
    pub key_version: u32,
    pub public_key_pem: String,
    pub public_key_digest_sha256: String,
    pub secret_id: String,
    pub attestation_mode: String,
    pub secret_storage: String,
    #[serde(default = "default_storage_protection")]
    pub storage_protection: String,
    #[serde(default = "default_storage_provider")]
    pub storage_provider: String,
    #[serde(default)]
    pub os_attested: bool,
    #[serde(default)]
    pub hardware_backed: bool,
    pub created_at: String,
    pub rotated_at: Option<String>,
}

fn default_storage_protection() -> String {
    "best_effort".into()
}

fn default_storage_provider() -> String {
    "filesystem".into()
}

fn metadata_dir(base_dir: &Path) -> PathBuf {
    base_dir.join("device-identities")
}

fn metadata_path(base_dir: &Path, device_id: &str) -> PathBuf {
    metadata_dir(base_dir).join(format!("{device_id}.json"))
}

fn now_iso8601() -> Result<String, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?;
    let timestamp = chrono_like_iso(duration.as_secs() as i64);
    Ok(timestamp)
}

fn chrono_like_iso(epoch_seconds: i64) -> String {
    let datetime = time::OffsetDateTime::from_unix_timestamp(epoch_seconds)
        .unwrap_or(time::OffsetDateTime::UNIX_EPOCH);
    datetime
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn sanitize_device_id(device_id: &str) -> Result<String, String> {
    let trimmed = device_id.trim();
    if trimmed.is_empty() {
        return Err("device_id is required".into());
    }
    Ok(trimmed
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '_' })
        .collect())
}

fn resolve_attestation_mode(metadata: &SecretMetadata) -> String {
    if let Ok(override_mode) = env::var("SMARTSPEC_DEVICE_ATTESTATION_MODE") {
        let normalized = override_mode.trim().to_ascii_lowercase();
        if matches!(
            normalized.as_str(),
            "software_pkcs8" | "os_protected" | "os_keychain" | "os_attested" | "hardware_attested"
        ) {
            return normalized;
        }
    }
    if metadata.hardware_backed {
        return "hardware_attested".into();
    }
    if metadata.os_attested {
        return "os_attested".into();
    }
    match metadata.storage_backend.as_str() {
        "os_keychain" => "os_keychain".into(),
        "windows_dpapi" => "os_protected".into(),
        _ => "software_pkcs8".into(),
    }
}

fn write_identity_metadata(base_dir: &Path, record: &DeviceIdentityRecord) -> Result<(), String> {
    fs::create_dir_all(metadata_dir(base_dir)).map_err(|error| error.to_string())?;
    fs::write(
        metadata_path(base_dir, &record.device_id),
        serde_json::to_vec(record).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

pub fn read_device_identity(base_dir: &Path, device_id: &str) -> Result<DeviceIdentityRecord, String> {
    let path = metadata_path(base_dir, &sanitize_device_id(device_id)?);
    let raw = fs::read(path).map_err(|error| error.to_string())?;
    serde_json::from_slice(&raw).map_err(|error| error.to_string())
}

pub fn initialize_device_identity(
    base_dir: &Path,
    device_id: &str,
    key_version: u32,
) -> Result<DeviceIdentityRecord, String> {
    let sanitized_device_id = sanitize_device_id(device_id)?;
    if key_version == 0 {
        return Err("key_version must be at least 1".into());
    }
    if let Ok(existing) = read_device_identity(base_dir, &sanitized_device_id) {
        if existing.key_version != key_version {
            return Err(
                "device identity already exists with a different key_version; use rotate_device_identity"
                    .into(),
            );
        }
        return Ok(existing);
    }

    let keypair = generate_device_signing_keypair()?;
    let secret_id = format!("desktop-device-{sanitized_device_id}-signing-key-v{key_version}");
    let metadata = store_secret(
        base_dir,
        SecretDescriptor {
            secret_id: secret_id.clone(),
            scope: "device_identity_signing_key".into(),
            secret_value: keypair.pkcs8_private_key_base64,
        },
    )?;

    let record = DeviceIdentityRecord {
        device_id: sanitized_device_id,
        key_algorithm: keypair.key_algorithm,
        key_version,
        public_key_pem: keypair.public_key_pem,
        public_key_digest_sha256: keypair.public_key_digest_sha256,
        secret_id,
        attestation_mode: resolve_attestation_mode(&metadata),
        secret_storage: metadata.storage_backend,
        storage_protection: metadata.storage_protection,
        storage_provider: metadata.storage_provider,
        os_attested: metadata.os_attested,
        hardware_backed: metadata.hardware_backed,
        created_at: now_iso8601()?,
        rotated_at: None,
    };
    write_identity_metadata(base_dir, &record)?;
    Ok(record)
}

pub fn rotate_device_identity(
    base_dir: &Path,
    device_id: &str,
    next_key_version: u32,
) -> Result<DeviceIdentityRecord, String> {
    let existing = read_device_identity(base_dir, device_id)?;
    if next_key_version <= existing.key_version {
        return Err("next_key_version must be greater than the current key_version".into());
    }
    let keypair = generate_device_signing_keypair()?;
    let secret_id = format!(
        "desktop-device-{}-signing-key-v{}",
        existing.device_id, next_key_version
    );
    let metadata = store_secret(
        base_dir,
        SecretDescriptor {
            secret_id: secret_id.clone(),
            scope: "device_identity_signing_key".into(),
            secret_value: keypair.pkcs8_private_key_base64,
        },
    )?;
    let _ = delete_secret(base_dir, &existing.secret_id);

    let record = DeviceIdentityRecord {
        device_id: existing.device_id,
        key_algorithm: keypair.key_algorithm,
        key_version: next_key_version,
        public_key_pem: keypair.public_key_pem,
        public_key_digest_sha256: keypair.public_key_digest_sha256,
        secret_id,
        attestation_mode: resolve_attestation_mode(&metadata),
        secret_storage: metadata.storage_backend,
        storage_protection: metadata.storage_protection,
        storage_provider: metadata.storage_provider,
        os_attested: metadata.os_attested,
        hardware_backed: metadata.hardware_backed,
        created_at: existing.created_at,
        rotated_at: Some(now_iso8601()?),
    };
    write_identity_metadata(base_dir, &record)?;
    Ok(record)
}

#[tauri::command]
pub async fn desktop_host_initialize_device_identity(
    base_dir: String,
    device_id: String,
    key_version: u32,
) -> Result<DeviceIdentityRecord, String> {
    initialize_device_identity(Path::new(&base_dir), &device_id, key_version)
}

#[tauri::command]
pub async fn desktop_host_read_device_identity(
    base_dir: String,
    device_id: String,
) -> Result<DeviceIdentityRecord, String> {
    read_device_identity(Path::new(&base_dir), &device_id)
}

#[tauri::command]
pub async fn desktop_host_rotate_device_identity(
    base_dir: String,
    device_id: String,
    next_key_version: u32,
) -> Result<DeviceIdentityRecord, String> {
    rotate_device_identity(Path::new(&base_dir), &device_id, next_key_version)
}
