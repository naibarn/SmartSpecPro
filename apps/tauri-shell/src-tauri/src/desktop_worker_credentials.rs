use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::secret_store::{
    delete_secret, read_secret_metadata, read_secret_value, store_secret, SecretDescriptor,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DesktopCredentialScope {
    WorkerRegistration,
    WorkerExecution,
    WorkerUpload,
    DesktopRuntime,
    DesktopRefresh,
}

impl DesktopCredentialScope {
    fn as_str(&self) -> &'static str {
        match self {
            Self::WorkerRegistration => "worker_registration",
            Self::WorkerExecution => "worker_execution",
            Self::WorkerUpload => "worker_upload",
            Self::DesktopRuntime => "desktop_runtime",
            Self::DesktopRefresh => "desktop_refresh",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopCredentialDescriptor {
    pub device_id: String,
    pub scope: DesktopCredentialScope,
    pub subject_id: Option<String>,
    pub secret_value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopCredentialMetadata {
    pub secret_id: String,
    pub device_id: String,
    pub scope: DesktopCredentialScope,
    pub subject_id: Option<String>,
    pub digest_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopCredentialValue {
    pub secret_id: String,
    pub device_id: String,
    pub scope: DesktopCredentialScope,
    pub subject_id: Option<String>,
    pub secret_value: String,
}

fn sanitize_segment(segment: &str) -> Result<String, String> {
    let trimmed = segment.trim();
    if trimmed.is_empty() {
        return Err("credential segment cannot be empty".into());
    }
    let sanitized = trimmed
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();

    if sanitized.is_empty() {
        return Err("credential segment cannot be empty after sanitization".into());
    }

    Ok(sanitized)
}

pub fn build_desktop_credential_secret_id(
    device_id: &str,
    scope: &DesktopCredentialScope,
    subject_id: Option<&str>,
) -> Result<String, String> {
    let sanitized_device_id = sanitize_segment(device_id)?;
    let mut parts = vec!["desktop".to_string(), sanitized_device_id, scope.as_str().to_string()];
    if let Some(subject) = subject_id {
        parts.push(sanitize_segment(subject)?);
    }
    Ok(parts.join("__"))
}

pub fn store_desktop_credential(
    base_dir: &Path,
    descriptor: DesktopCredentialDescriptor,
) -> Result<DesktopCredentialMetadata, String> {
    if descriptor.secret_value.trim().is_empty() {
        return Err("secret_value is required".into());
    }

    let secret_id = build_desktop_credential_secret_id(
        &descriptor.device_id,
        &descriptor.scope,
        descriptor.subject_id.as_deref(),
    )?;
    let metadata = store_secret(
        base_dir,
        SecretDescriptor {
            secret_id: secret_id.clone(),
            scope: descriptor.scope.as_str().into(),
            secret_value: descriptor.secret_value,
        },
    )?;

    Ok(DesktopCredentialMetadata {
        secret_id,
        device_id: descriptor.device_id,
        scope: descriptor.scope,
        subject_id: descriptor.subject_id,
        digest_sha256: metadata.digest_sha256,
    })
}

pub fn read_desktop_credential_metadata(
    base_dir: &Path,
    device_id: &str,
    scope: DesktopCredentialScope,
    subject_id: Option<&str>,
) -> Result<DesktopCredentialMetadata, String> {
    let secret_id = build_desktop_credential_secret_id(device_id, &scope, subject_id)?;
    let metadata = read_secret_metadata(base_dir, &secret_id)?;
    Ok(DesktopCredentialMetadata {
        secret_id,
        device_id: device_id.into(),
        scope,
        subject_id: subject_id.map(String::from),
        digest_sha256: metadata.digest_sha256,
    })
}

pub fn read_desktop_credential_value(
    base_dir: &Path,
    device_id: &str,
    scope: DesktopCredentialScope,
    subject_id: Option<&str>,
) -> Result<DesktopCredentialValue, String> {
    let secret_id = build_desktop_credential_secret_id(device_id, &scope, subject_id)?;
    let secret_value = read_secret_value(base_dir, &secret_id)?;
    Ok(DesktopCredentialValue {
        secret_id,
        device_id: device_id.into(),
        scope,
        subject_id: subject_id.map(String::from),
        secret_value,
    })
}

pub fn delete_desktop_credential(
    base_dir: &Path,
    device_id: &str,
    scope: DesktopCredentialScope,
    subject_id: Option<&str>,
) -> Result<(), String> {
    let secret_id = build_desktop_credential_secret_id(device_id, &scope, subject_id)?;
    delete_secret(base_dir, &secret_id)
}

pub fn clear_worker_session_credentials(
    base_dir: &Path,
    device_id: &str,
    worker_id: &str,
) -> Result<usize, String> {
    let scopes = [
        DesktopCredentialScope::WorkerRegistration,
        DesktopCredentialScope::WorkerExecution,
        DesktopCredentialScope::WorkerUpload,
    ];

    let mut deleted = 0;
    for scope in scopes {
        if delete_desktop_credential(base_dir, device_id, scope, Some(worker_id)).is_ok() {
            deleted += 1;
        }
    }

    Ok(deleted)
}

pub fn clear_device_runtime_credentials(
    base_dir: &Path,
    device_id: &str,
) -> Result<usize, String> {
    let scopes = [
        DesktopCredentialScope::DesktopRuntime,
        DesktopCredentialScope::DesktopRefresh,
    ];

    let mut deleted = 0;
    for scope in scopes {
        if delete_desktop_credential(base_dir, device_id, scope, None).is_ok() {
            deleted += 1;
        }
    }

    Ok(deleted)
}

#[tauri::command]
pub async fn desktop_host_store_desktop_credential(
    base_dir: String,
    descriptor: DesktopCredentialDescriptor,
) -> Result<DesktopCredentialMetadata, String> {
    store_desktop_credential(Path::new(&base_dir), descriptor)
}

#[tauri::command]
pub async fn desktop_host_read_desktop_credential_metadata(
    base_dir: String,
    device_id: String,
    scope: DesktopCredentialScope,
    subject_id: Option<String>,
) -> Result<DesktopCredentialMetadata, String> {
    read_desktop_credential_metadata(Path::new(&base_dir), &device_id, scope, subject_id.as_deref())
}

#[tauri::command]
pub async fn desktop_host_read_desktop_credential_value(
    base_dir: String,
    device_id: String,
    scope: DesktopCredentialScope,
    subject_id: Option<String>,
) -> Result<DesktopCredentialValue, String> {
    read_desktop_credential_value(Path::new(&base_dir), &device_id, scope, subject_id.as_deref())
}

#[tauri::command]
pub async fn desktop_host_delete_desktop_credential(
    base_dir: String,
    device_id: String,
    scope: DesktopCredentialScope,
    subject_id: Option<String>,
) -> Result<(), String> {
    delete_desktop_credential(Path::new(&base_dir), &device_id, scope, subject_id.as_deref())
}

#[tauri::command]
pub async fn desktop_host_clear_worker_session_credentials(
    base_dir: String,
    device_id: String,
    worker_id: String,
) -> Result<usize, String> {
    clear_worker_session_credentials(Path::new(&base_dir), &device_id, &worker_id)
}

#[tauri::command]
pub async fn desktop_host_clear_device_runtime_credentials(
    base_dir: String,
    device_id: String,
) -> Result<usize, String> {
    clear_device_runtime_credentials(Path::new(&base_dir), &device_id)
}
