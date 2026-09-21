use crate::settings::WorkerAppSettings;
use crate::worker_executor;
use crate::WorkerAppState;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

pub const CONTENT_PROTECTION_RUNTIME_ID: &str = "content-protection-windows-x64";
const CONTENT_PROTECTION_CONTRACT_VERSION: &str = "content-protection.runtime.v1";
const MIN_MODEL_BYTES: u64 = 100 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContentProtectionFileBinding {
    pub path: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContentProtectionManifest {
    pub contract_version: String,
    pub runtime_id: String,
    pub version: String,
    pub target_platform: String,
    pub provider: String,
    pub provider_version: String,
    pub video_seal_commit: String,
    pub provider_command: String,
    pub model_path: String,
    pub requires_worker_runtime_version: String,
    pub files: Vec<ContentProtectionFileBinding>,
    pub health_checked: bool,
    pub license_notice: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContentProtectionRuntimeStatus {
    pub status: String,
    pub message: String,
    pub runtime_id: String,
    pub version: Option<String>,
    pub provider_ready: bool,
    pub worker_runtime_ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContentProtectionRuntimeInstallResult {
    pub status: String,
    pub message: String,
    pub version: Option<String>,
    pub provider_ready: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteContentProtectionManifest {
    runtime_id: String,
    version: String,
    allowed: bool,
    deny_reason: Option<String>,
    archive_url: Option<String>,
    archive_sha256: Option<String>,
    archive_size_bytes: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct RemoteApiErrorEnvelope {
    error: Option<RemoteApiError>,
}

#[derive(Debug, Deserialize)]
struct RemoteApiError {
    code: Option<String>,
    message: Option<String>,
}

fn runtime_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app_data_dir_unavailable: {error}"))?
        .join("content-protection-runtime"))
}

fn current_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_root(app)?.join("current"))
}

fn parse_manifest(root: &Path) -> Result<ContentProtectionManifest, String> {
    let bytes = fs::read(root.join("content-protection-manifest.json"))
        .map_err(|error| format!("content_protection_manifest_missing: {error}"))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| format!("content_protection_manifest_invalid: {error}"))
}

fn safe_relative_path(value: &str) -> bool {
    let path = Path::new(value);
    !value.is_empty()
        && !value.contains('\\')
        && !path.is_absolute()
        && !path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| format!("file_open_failed: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 1024 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|error| format!("file_read_failed: {error}"))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn validate_bundle(root: &Path) -> Result<ContentProtectionManifest, String> {
    let manifest = parse_manifest(root)?;
    if manifest.contract_version != CONTENT_PROTECTION_CONTRACT_VERSION
        || manifest.runtime_id != CONTENT_PROTECTION_RUNTIME_ID
        || manifest.target_platform != "windows-x64"
        || manifest.provider != "videoseal"
        || manifest.provider_version != "videoseal-1.0"
        || !manifest.health_checked
    {
        return Err("content_protection_manifest_contract_invalid".into());
    }
    if !safe_relative_path(&manifest.provider_command)
        || !manifest.provider_command.ends_with(".exe")
        || !safe_relative_path(&manifest.model_path)
        || !safe_relative_path(&manifest.license_notice)
    {
        return Err("content_protection_manifest_path_invalid".into());
    }
    let provider = root.join(&manifest.provider_command);
    let model = root.join(&manifest.model_path);
    if !provider.is_file() || !model.is_file() || !root.join(&manifest.license_notice).is_file() {
        return Err("content_protection_runtime_files_missing".into());
    }
    let mut provider_file = File::open(&provider)
        .map_err(|error| format!("content_protection_provider_read_failed: {error}"))?;
    let mut provider_header = [0u8; 2];
    provider_file
        .read_exact(&mut provider_header)
        .map_err(|error| format!("content_protection_provider_read_failed: {error}"))?;
    if &provider_header != b"MZ" {
        return Err("content_protection_provider_not_windows_pe".into());
    }
    if fs::metadata(&model)
        .map_err(|error| format!("content_protection_model_stat_failed: {error}"))?
        .len()
        < MIN_MODEL_BYTES
    {
        return Err("content_protection_model_too_small".into());
    }
    if manifest.files.is_empty() {
        return Err("content_protection_file_bindings_missing".into());
    }
    if manifest.requires_worker_runtime_version.trim().is_empty()
        || !manifest
            .files
            .iter()
            .any(|binding| binding.path == manifest.provider_command)
        || !manifest
            .files
            .iter()
            .any(|binding| binding.path == manifest.model_path)
        || !manifest
            .files
            .iter()
            .any(|binding| binding.path == manifest.license_notice)
    {
        return Err("content_protection_required_file_bindings_missing".into());
    }
    for binding in &manifest.files {
        if !safe_relative_path(&binding.path)
            || !binding
                .sha256
                .chars()
                .all(|value| value.is_ascii_hexdigit())
            || binding.sha256.len() != 64
        {
            return Err("content_protection_file_binding_invalid".into());
        }
        let path = root.join(&binding.path);
        if !path.is_file() || sha256_file(&path)?.to_lowercase() != binding.sha256.to_lowercase() {
            return Err(format!(
                "content_protection_file_checksum_mismatch: {}",
                binding.path
            ));
        }
    }
    Ok(manifest)
}

fn archive_output_path(root: &Path, name: &str) -> Result<PathBuf, String> {
    let path = Path::new(name);
    if name.contains('\\')
        || path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
    {
        return Err("content_protection_archive_unsafe_path".into());
    }
    Ok(root.join(path))
}

fn extract_archive(archive_path: &Path, staging_root: &Path) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|error| format!("archive_open_failed: {error}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("content_protection_archive_invalid: {error}"))?;
    fs::create_dir_all(staging_root)
        .map_err(|error| format!("content_protection_staging_create_failed: {error}"))?;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("content_protection_archive_entry_failed: {error}"))?;
        let output = archive_output_path(staging_root, entry.name())?;
        if entry.is_dir() {
            fs::create_dir_all(&output)
                .map_err(|error| format!("content_protection_directory_create_failed: {error}"))?;
            continue;
        }
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("content_protection_directory_create_failed: {error}"))?;
        }
        let mut target = File::create(&output)
            .map_err(|error| format!("content_protection_file_create_failed: {error}"))?;
        io::copy(&mut entry, &mut target)
            .map_err(|error| format!("content_protection_file_extract_failed: {error}"))?;
    }
    Ok(())
}

fn settings_snapshot(
    state: &tauri::State<'_, WorkerAppState>,
) -> Result<WorkerAppSettings, String> {
    state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings_lock_poisoned".into())
}

async fn fetch_remote_manifest(
    settings: &WorkerAppSettings,
) -> Result<RemoteContentProtectionManifest, String> {
    let url = format!(
        "{}/api/workers/runtime-pack/manifest?runtimeId={}&channel={}",
        settings.normalized_server_url().trim_end_matches('/'),
        CONTENT_PROTECTION_RUNTIME_ID,
        settings.runtime_channel.as_query_value(),
    );
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| format!("content_protection_manifest_client_failed: {error}"))?
        .get(url)
        .send()
        .await
        .map_err(|error| format!("content_protection_manifest_fetch_failed: {error}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let detail = response
            .json::<RemoteApiErrorEnvelope>()
            .await
            .ok()
            .and_then(|body| body.error)
            .map(|error| {
                format!(
                    "{}: {}",
                    error.code.unwrap_or_else(|| "runtime_request_failed".into()),
                    error.message.unwrap_or_else(|| status.to_string()),
                )
            })
            .unwrap_or_else(|| status.to_string());
        return Err(format!("content_protection_manifest_http_{} {}", status, detail));
    }
    response
        .json::<RemoteContentProtectionManifest>()
        .await
        .map_err(|error| format!("content_protection_manifest_json_invalid: {error}"))
}

async fn download_archive(
    url: &str,
    archive_path: &Path,
    expected_size: Option<u64>,
) -> Result<(), String> {
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|error| format!("content_protection_download_client_failed: {error}"))?
        .get(url)
        .send()
        .await
        .map_err(|error| format!("content_protection_download_failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "content_protection_download_http_{}",
            response.status()
        ));
    }
    let partial = archive_path.with_extension("zip.download");
    let mut file = tokio::fs::File::create(&partial)
        .await
        .map_err(|error| format!("content_protection_partial_create_failed: {error}"))?;
    let mut downloaded = 0u64;
    let mut response = response;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("content_protection_download_stream_failed: {error}"))?
    {
        downloaded += chunk.len() as u64;
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(|error| format!("content_protection_partial_write_failed: {error}"))?;
    }
    tokio::io::AsyncWriteExt::flush(&mut file)
        .await
        .map_err(|error| format!("content_protection_partial_flush_failed: {error}"))?;
    drop(file);
    if expected_size.is_some_and(|expected| expected != downloaded) {
        return Err("content_protection_archive_size_mismatch".into());
    }
    fs::rename(&partial, archive_path)
        .map_err(|error| format!("content_protection_archive_finalize_failed: {error}"))
}

fn install_staging(staging_root: &Path, current_root: &Path) -> Result<(), String> {
    let parent = current_root
        .parent()
        .ok_or_else(|| "content_protection_runtime_parent_missing".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("content_protection_runtime_create_failed: {error}"))?;
    let backup = parent.join("previous");
    let _ = fs::remove_dir_all(&backup);
    if current_root.exists() {
        fs::rename(current_root, &backup)
            .map_err(|error| format!("content_protection_runtime_backup_failed: {error}"))?;
    }
    if let Err(error) = fs::rename(staging_root, current_root) {
        let _ = fs::rename(&backup, current_root);
        return Err(format!(
            "content_protection_runtime_activate_failed: {error}"
        ));
    }
    let _ = fs::remove_dir_all(backup);
    Ok(())
}

fn run_provider_health(
    root: &Path,
    manifest: &ContentProtectionManifest,
    effective_runtime_dir: &Path,
    resource_dir: &Path,
) -> Result<(), String> {
    let provider = root.join(&manifest.provider_command);
    let ffmpeg = effective_runtime_dir.join("runtime-pack/bin/ffmpeg.exe");
    let ffprobe = effective_runtime_dir.join("runtime-pack/bin/ffprobe.exe");
    let ffmpeg = if ffmpeg.is_file() {
        ffmpeg
    } else {
        resource_dir.join("runtime-pack/bin/ffmpeg.exe")
    };
    let ffprobe = if ffprobe.is_file() {
        ffprobe
    } else {
        resource_dir.join("runtime-pack/bin/ffprobe.exe")
    };
    if !ffmpeg.is_file() || !ffprobe.is_file() {
        return Err("content_protection_worker_runtime_media_tools_missing".into());
    }
    let output = Command::new(&provider)
        .arg("--health")
        .env("CONTENT_PROTECTION_MODEL_DIR", root)
        .env("CONTENT_PROTECTION_FFMPEG", &ffmpeg)
        .env("CONTENT_PROTECTION_FFPROBE", &ffprobe)
        .output()
        .map_err(|error| format!("content_protection_health_start_failed: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "content_protection_health_failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn worker_app_get_content_protection_runtime_status(
    app: tauri::AppHandle,
) -> Result<ContentProtectionRuntimeStatus, String> {
    if !cfg!(windows) {
        return Ok(ContentProtectionRuntimeStatus {
            status: "unsupported".into(),
            message: "Content Protection native runtime is available for Windows x64 only.".into(),
            runtime_id: CONTENT_PROTECTION_RUNTIME_ID.into(),
            version: None,
            provider_ready: false,
            worker_runtime_ready: false,
        });
    }
    let current = current_root(&app)?;
    let manifest = parse_manifest(&current).ok();
    let provider_ready = worker_executor::content_protection_runtime_ready();
    Ok(ContentProtectionRuntimeStatus {
        status: if provider_ready {
            "ready".into()
        } else if manifest.is_some() {
            "blocked".into()
        } else {
            "not_installed".into()
        },
        message: if provider_ready {
            "Content Protection runtime is ready.".into()
        } else if manifest.is_some() {
            "Content Protection runtime is installed but not ready.".into()
        } else {
            "Optional Content Protection runtime is not installed.".into()
        },
        runtime_id: CONTENT_PROTECTION_RUNTIME_ID.into(),
        version: manifest.map(|value| value.version),
        provider_ready,
        worker_runtime_ready: true,
    })
}

#[tauri::command]
pub async fn worker_app_install_content_protection_runtime(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    force: Option<bool>,
) -> Result<ContentProtectionRuntimeInstallResult, String> {
    if !cfg!(windows) {
        return Err("content_protection_runtime_requires_windows_x64".into());
    }
    let settings = settings_snapshot(&state)?;
    let remote = fetch_remote_manifest(&settings).await?;
    if remote.runtime_id != CONTENT_PROTECTION_RUNTIME_ID || !remote.allowed {
        return Err(remote
            .deny_reason
            .unwrap_or_else(|| "content_protection_runtime_not_allowed".into()));
    }
    let archive_url = remote
        .archive_url
        .ok_or_else(|| "content_protection_archive_url_missing".to_string())?;
    let archive_url = if archive_url.starts_with("http://") || archive_url.starts_with("https://") {
        archive_url
    } else if archive_url.starts_with('/') {
        format!(
            "{}{}",
            settings.normalized_server_url().trim_end_matches('/'),
            archive_url
        )
    } else {
        return Err("content_protection_archive_url_invalid".into());
    };
    let archive_sha256 = remote
        .archive_sha256
        .filter(|value| value.len() == 64)
        .ok_or_else(|| "content_protection_archive_checksum_missing".to_string())?;
    let root = runtime_root(&app)?;
    let downloads = root.join("downloads");
    fs::create_dir_all(&downloads)
        .map_err(|error| format!("content_protection_download_dir_failed: {error}"))?;
    let archive_path = downloads.join(format!(
        "{}-{}.zip",
        CONTENT_PROTECTION_RUNTIME_ID, remote.version
    ));
    if force.unwrap_or(false) {
        let _ = fs::remove_file(&archive_path);
        let _ = fs::remove_file(archive_path.with_extension("zip.download"));
    }
    download_archive(&archive_url, &archive_path, remote.archive_size_bytes).await?;
    if sha256_file(&archive_path)?.to_lowercase() != archive_sha256.to_lowercase() {
        return Err("content_protection_archive_checksum_mismatch".into());
    }
    let staging = root.join(format!(
        "staging-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    ));
    let _ = fs::remove_dir_all(&staging);
    extract_archive(&archive_path, &staging)?;
    let manifest = validate_bundle(&staging)?;
    if manifest.version != remote.version {
        let _ = fs::remove_dir_all(&staging);
        return Err("content_protection_manifest_version_mismatch".into());
    }
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("resource_dir_unavailable: {error}"))?;
    let effective_runtime_dir = crate::commands::get_effective_runtime_dir(&app)?;
    if let Err(error) =
        run_provider_health(&staging, &manifest, &effective_runtime_dir, &resource_dir)
    {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    install_staging(&staging, &root.join("current"))?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app_data_dir_unavailable: {error}"))?;
    worker_executor::configure_installed_content_protection(
        &app_data_dir,
        &effective_runtime_dir,
        &resource_dir,
    );
    let provider_ready = worker_executor::content_protection_runtime_ready();
    Ok(ContentProtectionRuntimeInstallResult {
        status: if provider_ready {
            "installed"
        } else {
            "blocked"
        }
        .into(),
        message: if provider_ready {
            format!("Content Protection runtime {} is ready.", manifest.version)
        } else {
            "Content Protection runtime was installed but is not ready.".into()
        },
        version: Some(manifest.version),
        provider_ready,
    })
}

#[cfg(test)]
mod tests {
    use super::safe_relative_path;

    #[test]
    fn rejects_archive_traversal_paths() {
        assert!(!safe_relative_path("../provider.exe"));
        assert!(!safe_relative_path("C:\\provider.exe"));
        assert!(safe_relative_path("provider/videoseal-provider.exe"));
    }
}
