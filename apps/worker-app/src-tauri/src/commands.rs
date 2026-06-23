use crate::credentials::{
    clear_connection, ensure_device_proof_material, load_connection, save_connection,
    StoredWorkerConnection, WorkerDeviceProofMaterial,
};
use crate::executor_state::ExecutorState;
use crate::runtime_manifest::{
    doctor_from_installed_or_default_paths, read_runtime_pack_manifest, RuntimePackManifest,
    DoctorSummary,
};
use crate::settings::{save_settings, WorkerAppSettings};
use crate::WorkerAppState;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use crate::control_plane::{build_registration_payload, WorkerAppRegistrationPayload};
use crate::executor_state::ExecutorStatus;
use crate::worker_control_plane::{post_worker_json, WorkerApiTokens, WorkerLoopConnection};
use crate::worker_loop::{start_worker_loop, WorkerLoopStatus};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerConnectSession {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerConnectPollResponse {
    pub status: String,
    pub interval: Option<u64>,
    pub expires_at: Option<String>,
    pub worker: Option<WorkerConnectWorker>,
    pub tokens: Option<WorkerConnectTokens>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerConnectWorker {
    pub id: String,
    pub display_name: String,
    pub runtime_type: String,
    pub machine_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerConnectTokens {
    pub execution_token: String,
    pub upload_token: String,
    pub refresh_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInstallResult {
    pub status: String,
    pub message: String,
    pub manifest: Option<RuntimePackManifest>,
    pub doctor: DoctorSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct WorkerConnectRefreshEnvelope {
    pub tokens: WorkerConnectTokens,
}

#[tauri::command]
pub async fn worker_app_get_settings(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<WorkerAppSettings, String> {
    state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings lock poisoned".to_string())
}

#[tauri::command]
pub async fn worker_app_save_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    settings: WorkerAppSettings,
) -> Result<WorkerAppSettings, String> {
    settings.validate()?;
    let settings = WorkerAppSettings {
        server_url: settings.normalized_server_url(),
        ..settings
    };
    let mut locked = state
        .settings
        .lock()
        .map_err(|_| "settings lock poisoned".to_string())?;
    *locked = settings.clone();
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    save_settings(&app_data_dir, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub async fn worker_app_get_saved_connection(
    app: tauri::AppHandle,
) -> Result<Option<StoredWorkerConnection>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    load_connection(&app_data_dir)
}

#[tauri::command]
pub async fn worker_app_clear_saved_connection(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    clear_connection(&app_data_dir)?;
    worker_app_stop_worker_loop(state).await.map(|_| ())
}

#[tauri::command]
pub async fn worker_app_get_executor_state(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<ExecutorState, String> {
    state
        .executor
        .lock()
        .map(|executor| executor.clone())
        .map_err(|_| "executor lock poisoned".to_string())
}

#[tauri::command]
pub async fn worker_app_run_doctor(app: tauri::AppHandle) -> Result<DoctorSummary, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("resource directory unavailable: {error}"))?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    Ok(doctor_from_installed_or_default_paths(
        &resource_dir,
        &app_data_dir,
    ))
}

#[tauri::command]
pub async fn worker_app_install_runtime_pack(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<RuntimeInstallResult, String> {
    let settings = state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings lock poisoned".to_string())?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("resource directory unavailable: {error}"))?;
    let manifest = fetch_runtime_manifest(
        &settings.normalized_server_url(),
        settings.runtime_channel.as_query_value(),
    )
    .await?;
    if !manifest.allowed {
        return Ok(RuntimeInstallResult {
            status: "blocked".into(),
            message: manifest
                .deny_reason
                .clone()
                .unwrap_or_else(|| "Runtime pack is not allowed by server policy.".into()),
            manifest: Some(manifest),
            doctor: doctor_from_installed_or_default_paths(&resource_dir, &app_data_dir),
        });
    }
    let archive_url = manifest
        .archive_url
        .clone()
        .ok_or_else(|| "Runtime manifest does not include archiveUrl.".to_string())?;
    let archive_sha256 = manifest
        .archive_sha256
        .clone()
        .ok_or_else(|| "Runtime manifest does not include archiveSha256.".to_string())?;
    let absolute_archive_url = absolute_url(&settings.normalized_server_url(), &archive_url)?;
    let temp_dir = app_data_dir.join("runtime-downloads");
    fs::create_dir_all(&temp_dir)
        .map_err(|error| format!("failed to create runtime download directory: {error}"))?;
    let archive_path = temp_dir.join(format!(
        "{}-{}.zip",
        sanitize_file_segment(&manifest.runtime_id),
        sanitize_file_segment(&manifest.version)
    ));
    download_runtime_archive(&absolute_archive_url, &archive_path, manifest.archive_size_bytes)
        .await?;
    let digest = file_sha256(&archive_path)?;
    if !digest.eq_ignore_ascii_case(&archive_sha256) {
        return Err(format!(
            "Runtime archive checksum mismatch. Expected {archive_sha256}, got {digest}."
        ));
    }
    extract_runtime_archive(&archive_path, &app_data_dir)?;
    let installed_manifest_path = app_data_dir.join("runtime-pack").join("manifest.json");
    let installed_manifest = read_runtime_pack_manifest(&installed_manifest_path)?;
    if installed_manifest.runtime_profile_hash != manifest.runtime_profile_hash {
        return Err("Installed runtime profile hash does not match server manifest.".into());
    }
    let doctor = doctor_from_installed_or_default_paths(&resource_dir, &app_data_dir);
    if doctor.status != "ready" {
        return Ok(RuntimeInstallResult {
            status: "blocked".into(),
            message: "Runtime was installed, but readiness checks are still blocked.".into(),
            manifest: Some(installed_manifest),
            doctor,
        });
    }
    Ok(RuntimeInstallResult {
        status: "installed".into(),
        message: format!("Runtime pack {} is ready.", installed_manifest.version),
        manifest: Some(installed_manifest),
        doctor,
    })
}

#[tauri::command]
pub async fn worker_app_start_connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<(), String> {
    let server_url = state
        .settings
        .lock()
        .map(|settings| settings.normalized_server_url())
        .map_err(|_| "settings lock poisoned".to_string())?;
    let url = worker_connect_url(&server_url);
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| format!("unable to open browser approval: {error}"))
}

#[tauri::command]
pub async fn worker_app_start_connect_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<WorkerConnectSession, String> {
    let settings = state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings lock poisoned".to_string())?;
    let doctor = worker_app_run_doctor(app.clone()).await?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let device_proof = ensure_device_proof_material(&app_data_dir)?;
    let payload = build_registration_payload(&settings, &doctor, device_proof.binding());
    let session = start_worker_connect_session(&settings.normalized_server_url(), &payload).await?;
    app.opener()
        .open_url(session.verification_uri_complete.clone(), None::<&str>)
        .map_err(|error| format!("unable to open browser approval: {error}"))?;
    Ok(session)
}

#[tauri::command]
pub async fn worker_app_poll_connect_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    device_code: String,
) -> Result<WorkerConnectPollResponse, String> {
    let server_url = state
        .settings
        .lock()
        .map(|settings| settings.normalized_server_url())
        .map_err(|_| "settings lock poisoned".to_string())?;
    let response = poll_worker_connect_session(&server_url, &device_code).await?;
    if response.status == "approved" {
        if let (Some(worker), Some(tokens)) = (response.worker.clone(), response.tokens.clone()) {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("app data directory unavailable: {error}"))?;
            save_connection(
                &app_data_dir,
                &StoredWorkerConnection {
                    server_url,
                    worker,
                    tokens,
                    connected_at: now_rfc3339(),
                    last_refreshed_at: None,
                },
            )?;
        }
    }
    Ok(response)
}

#[tauri::command]
pub async fn worker_app_refresh_connect_tokens(
    app: tauri::AppHandle,
    server_url: String,
    refresh_token: String,
) -> Result<WorkerConnectTokens, String> {
    if refresh_token.trim().is_empty() {
        return Err("refresh token is required".into());
    }
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let device_proof = ensure_device_proof_material(&app_data_dir)?;
    refresh_worker_connect_tokens(server_url.trim(), refresh_token.trim(), &device_proof).await
}

#[tauri::command]
pub async fn worker_app_refresh_saved_connection(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<StoredWorkerConnection, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let mut stored = load_connection(&app_data_dir)?
        .ok_or_else(|| "Worker App is not connected yet.".to_string())?;
    let refresh_token = stored
        .tokens
        .refresh_token
        .clone()
        .ok_or_else(|| "Worker connection does not include a refresh token.".to_string())?;
    let device_proof = ensure_device_proof_material(&app_data_dir)?;
    stored.tokens =
        refresh_worker_connect_tokens(&stored.server_url, &refresh_token, &device_proof).await?;
    stored.last_refreshed_at = Some(now_rfc3339());
    save_connection(&app_data_dir, &stored)?;
    update_running_loop_connection(&state, &stored, &app_data_dir)?;
    Ok(stored)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerLoopStartRequest {
    pub server_url: String,
    pub worker_id: String,
    pub worker_label: String,
    pub execution_token: String,
    pub upload_token: String,
}

#[tauri::command]
pub async fn worker_app_start_worker_loop(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    request: WorkerLoopStartRequest,
) -> Result<WorkerLoopStatus, String> {
    if request.worker_id.trim().is_empty() {
        return Err("worker id is required before starting the background loop".into());
    }
    if request.execution_token.trim().is_empty() || request.upload_token.trim().is_empty() {
        return Err("worker execution and upload tokens are required".into());
    }
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("resource directory unavailable: {error}"))?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let device_proof = ensure_device_proof_material(&app_data_dir)?;
    let connection = WorkerLoopConnection {
        server_url: request.server_url.trim().trim_end_matches('/').to_string(),
        worker_id: request.worker_id.trim().to_string(),
        worker_label: request.worker_label.trim().to_string(),
        tokens: WorkerApiTokens {
            execution_token: request.execution_token.trim().to_string(),
            upload_token: request.upload_token.trim().to_string(),
        },
        device_proof,
    };

    let mut locked_loop = state
        .worker_loop
        .lock()
        .map_err(|_| "worker loop lock poisoned".to_string())?;
    if let Some(existing) = locked_loop.as_ref() {
        let mut locked_connection = existing
            .connection
            .lock()
            .map_err(|_| "worker loop connection lock poisoned".to_string())?;
        *locked_connection = connection;
        return Ok(WorkerLoopStatus {
            running: true,
            mode: "foreground_background_loop".into(),
            message: "Worker loop is already running; connection tokens were updated without stopping active work.".into(),
        });
    }
    let handle = start_worker_loop(
        state.settings.clone(),
        state.executor.clone(),
        resource_dir,
        app_data_dir,
        connection,
    );
    *locked_loop = Some(handle);
    Ok(WorkerLoopStatus {
        running: true,
        mode: "foreground_background_loop".into(),
        message: "Worker loop is running in this app process.".into(),
    })
}

#[tauri::command]
pub async fn worker_app_start_saved_worker_loop(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<WorkerLoopStatus, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let stored = load_connection(&app_data_dir)?
        .ok_or_else(|| "Connect this Worker App before starting the worker loop.".to_string())?;
    worker_app_start_worker_loop(
        app,
        state,
        WorkerLoopStartRequest {
            server_url: stored.server_url,
            worker_id: stored.worker.id,
            worker_label: stored.worker.display_name,
            execution_token: stored.tokens.execution_token,
            upload_token: stored.tokens.upload_token,
        },
    )
    .await
}

#[tauri::command]
pub async fn worker_app_stop_worker_loop(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<WorkerLoopStatus, String> {
    let mut locked_loop = state
        .worker_loop
        .lock()
        .map_err(|_| "worker loop lock poisoned".to_string())?;
    if let Some(existing) = locked_loop.take() {
        existing
            .cancel
            .store(true, std::sync::atomic::Ordering::Relaxed);
        existing.handle.abort();
    }
    if let Ok(mut executor) = state.executor.lock() {
        executor.accepting_jobs = false;
        executor.current_job_id = None;
        executor.current_job_label = None;
        executor.progress_percent = 0;
        executor.status = ExecutorStatus::Idle;
        executor.last_message = "Worker loop stopped.".into();
    }
    Ok(WorkerLoopStatus {
        running: false,
        mode: "manual".into(),
        message: "Worker loop stopped.".into(),
    })
}

#[tauri::command]
pub async fn worker_app_get_worker_loop_status(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<WorkerLoopStatus, String> {
    let running = state
        .worker_loop
        .lock()
        .map(|handle| handle.is_some())
        .map_err(|_| "worker loop lock poisoned".to_string())?;
    Ok(WorkerLoopStatus {
        running,
        mode: if running {
            "foreground_background_loop".into()
        } else {
            "manual".into()
        },
        message: if running {
            "Worker loop is running in this app process.".into()
        } else {
            "Worker loop is stopped.".into()
        },
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartupModeStatus {
    pub start_with_windows: bool,
    pub service_available: bool,
    pub message: String,
}

#[tauri::command]
pub async fn worker_app_configure_startup(enabled: bool) -> Result<StartupModeStatus, String> {
    configure_windows_login_startup(enabled)
}

#[cfg(target_os = "windows")]
fn configure_windows_login_startup(enabled: bool) -> Result<StartupModeStatus, String> {
    let exe = std::env::current_exe()
        .map_err(|error| format!("unable to resolve Worker App executable path: {error}"))?;
    let exe = exe
        .to_str()
        .ok_or_else(|| "Worker App executable path is not valid UTF-8".to_string())?;
    let status = if enabled {
        std::process::Command::new("reg")
            .args([
                "add",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "SmartAIHubWorkerApp",
                "/t",
                "REG_SZ",
                "/d",
                &format!("\"{exe}\""),
                "/f",
            ])
            .status()
            .map_err(|error| format!("failed to configure Windows login startup: {error}"))?
    } else {
        std::process::Command::new("reg")
            .args([
                "delete",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "SmartAIHubWorkerApp",
                "/f",
            ])
            .status()
            .map_err(|error| format!("failed to remove Windows login startup: {error}"))?
    };
    if !status.success() {
        return Err(format!(
            "Windows startup registry command failed with {status}"
        ));
    }
    Ok(StartupModeStatus {
        start_with_windows: enabled,
        service_available: false,
        message: if enabled {
            "Worker App will start when this Windows user signs in. This is not a Windows service."
                .into()
        } else {
            "Windows login autostart is disabled.".into()
        },
    })
}

#[cfg(not(target_os = "windows"))]
fn configure_windows_login_startup(enabled: bool) -> Result<StartupModeStatus, String> {
    Ok(StartupModeStatus {
        start_with_windows: false,
        service_available: false,
        message: if enabled {
            "Windows login autostart can only be configured from the Windows build.".into()
        } else {
            "Windows login autostart is disabled.".into()
        },
    })
}

async fn start_worker_connect_session(
    server_url: &str,
    payload: &WorkerAppRegistrationPayload,
) -> Result<WorkerConnectSession, String> {
    let url = format!(
        "{}/api/workers/connect/start",
        server_url.trim().trim_end_matches('/')
    );
    let response = reqwest::Client::new()
        .post(url)
        .json(&json!({ "payload": payload }))
        .send()
        .await
        .map_err(|error| format!("unable to start browser approval: {error}"))?;
    parse_json_response::<WorkerConnectSession>(response).await
}

async fn poll_worker_connect_session(
    server_url: &str,
    device_code: &str,
) -> Result<WorkerConnectPollResponse, String> {
    let url = format!(
        "{}/api/workers/connect/token",
        server_url.trim().trim_end_matches('/')
    );
    let response = reqwest::Client::new()
        .post(url)
        .json(&json!({ "deviceCode": device_code }))
        .send()
        .await
        .map_err(|error| format!("unable to check browser approval: {error}"))?;
    parse_json_response::<WorkerConnectPollResponse>(response).await
}

async fn refresh_worker_connect_tokens(
    server_url: &str,
    refresh_token: &str,
    device_proof: &WorkerDeviceProofMaterial,
) -> Result<WorkerConnectTokens, String> {
    let envelope = post_worker_json::<WorkerConnectRefreshEnvelope, _>(
        server_url,
        "/api/workers/connect/refresh",
        refresh_token,
        &json!({}),
        device_proof,
    )
    .await
    .map_err(|error| format!("unable to refresh worker access: {error}"))?;
    Ok(envelope.tokens)
}

async fn fetch_runtime_manifest(
    server_url: &str,
    channel: &str,
) -> Result<RuntimePackManifest, String> {
    let url = format!(
        "{}/api/workers/runtime-pack/manifest?runtimeId=hyperframes-windows-x64&channel={}",
        server_url.trim().trim_end_matches('/'),
        channel.trim()
    );
    let response = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|error| format!("unable to fetch runtime manifest: {error}"))?;
    parse_json_response::<RuntimePackManifest>(response)
        .await
        .map_err(|error| format!("runtime manifest unavailable: {error}"))
}

fn absolute_url(server_url: &str, value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.starts_with("https://") || value.starts_with("http://") {
        return Ok(value.to_string());
    }
    if !value.starts_with('/') {
        return Err("runtime archiveUrl must be absolute or root-relative".into());
    }
    Ok(format!("{}{}", server_url.trim().trim_end_matches('/'), value))
}

fn sanitize_file_segment(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
                ch
            } else {
                '-'
            }
        })
        .collect();
    sanitized.trim_matches(&['-', '.'][..]).to_string()
}

async fn download_runtime_archive(
    url: &str,
    archive_path: &Path,
    expected_size_bytes: Option<u64>,
) -> Result<(), String> {
    let mut response = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|error| format!("unable to download runtime archive: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "runtime archive download failed with {}",
            response.status()
        ));
    }
    let mut file = File::create(archive_path)
        .map_err(|error| format!("failed to create runtime archive: {error}"))?;
    let mut downloaded: u64 = 0;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("failed while downloading runtime archive: {error}"))?
    {
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        file.write_all(&chunk)
            .map_err(|error| format!("failed to write runtime archive: {error}"))?;
    }
    file.flush()
        .map_err(|error| format!("failed to flush runtime archive: {error}"))?;
    if let Some(expected) = expected_size_bytes {
        if expected != downloaded {
            return Err(format!(
                "runtime archive size mismatch. Expected {expected} bytes, got {downloaded} bytes."
            ));
        }
    }
    Ok(())
}

fn file_sha256(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| format!("failed to open file: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("failed to read file: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn extract_runtime_archive(archive_path: &Path, app_data_dir: &Path) -> Result<(), String> {
    let file = File::open(archive_path)
        .map_err(|error| format!("failed to open runtime archive: {error}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("runtime archive is not a valid zip: {error}"))?;
    let install_root = app_data_dir.join("runtime-install");
    if install_root.exists() {
        fs::remove_dir_all(&install_root)
            .map_err(|error| format!("failed to clear runtime install staging: {error}"))?;
    }
    fs::create_dir_all(&install_root)
        .map_err(|error| format!("failed to create runtime install staging: {error}"))?;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("failed to read runtime archive entry: {error}"))?;
        let out_path = safe_archive_output_path(&install_root, entry.name())?;
        if entry.is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|error| format!("failed to create runtime directory: {error}"))?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create runtime directory: {error}"))?;
        }
        let mut out_file = File::create(&out_path)
            .map_err(|error| format!("failed to create runtime file: {error}"))?;
        io::copy(&mut entry, &mut out_file)
            .map_err(|error| format!("failed to extract runtime file: {error}"))?;
    }
    let staged_runtime_pack = install_root.join("runtime-pack");
    let staged_sidecars = install_root.join("sidecars");
    if !staged_runtime_pack.join("manifest.json").is_file() {
        return Err("Runtime archive must contain runtime-pack/manifest.json.".into());
    }
    if !staged_sidecars.is_dir() {
        return Err("Runtime archive must contain sidecars/.".into());
    }
    replace_dir(&staged_runtime_pack, &app_data_dir.join("runtime-pack"))?;
    replace_dir(&staged_sidecars, &app_data_dir.join("sidecars"))?;
    let _ = fs::remove_dir_all(&install_root);
    Ok(())
}

fn safe_archive_output_path(root: &Path, name: &str) -> Result<PathBuf, String> {
    let relative = Path::new(name);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
    {
        return Err("Runtime archive contains an unsafe path.".into());
    }
    Ok(root.join(relative))
}

fn replace_dir(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() {
        fs::remove_dir_all(to)
            .map_err(|error| format!("failed to remove previous runtime directory: {error}"))?;
    }
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create runtime parent directory: {error}"))?;
    }
    fs::rename(from, to).map_err(|error| format!("failed to install runtime directory: {error}"))
}

fn update_running_loop_connection(
    state: &tauri::State<'_, WorkerAppState>,
    stored: &StoredWorkerConnection,
    app_data_dir: &std::path::Path,
) -> Result<(), String> {
    let locked_loop = state
        .worker_loop
        .lock()
        .map_err(|_| "worker loop lock poisoned".to_string())?;
    if let Some(existing) = locked_loop.as_ref() {
        let mut connection = existing
            .connection
            .lock()
            .map_err(|_| "worker loop connection lock poisoned".to_string())?;
        *connection = WorkerLoopConnection {
            server_url: stored.server_url.trim().trim_end_matches('/').to_string(),
            worker_id: stored.worker.id.trim().to_string(),
            worker_label: stored.worker.display_name.trim().to_string(),
            tokens: WorkerApiTokens {
                execution_token: stored.tokens.execution_token.trim().to_string(),
                upload_token: stored.tokens.upload_token.trim().to_string(),
            },
            device_proof: ensure_device_proof_material(app_data_dir)?,
        };
    }
    Ok(())
}

fn now_rfc3339() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".into())
}

async fn parse_json_response<T>(response: reqwest::Response) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("unable to read server response: {error}"))?;
    if !status.is_success() {
        let message = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|value| {
                value
                    .get("message")
                    .and_then(|message| message.as_str())
                    .map(str::to_string)
                    .or_else(|| {
                        value
                            .get("error")
                            .and_then(|error| error.get("message"))
                            .and_then(|message| message.as_str())
                            .map(str::to_string)
                    })
                    .or_else(|| {
                        value
                            .get("error")
                            .and_then(|message| message.as_str())
                            .map(str::to_string)
                    })
            })
            .unwrap_or_else(|| text.chars().take(240).collect());
        return Err(format!(
            "server rejected worker connection ({status}): {message}"
        ));
    }
    serde_json::from_str::<T>(&text)
        .map_err(|error| format!("server returned an unexpected response: {error}"))
}

fn worker_connect_url(server_url: &str) -> String {
    format!(
        "{}/workers/connect",
        server_url.trim().trim_end_matches('/')
    )
}

#[cfg(test)]
mod tests {
    use super::worker_connect_url;

    #[test]
    fn worker_connect_url_uses_configured_server_without_double_slashes() {
        assert_eq!(
            worker_connect_url("https://smartaihub.app/"),
            "https://smartaihub.app/workers/connect",
        );
    }
}
