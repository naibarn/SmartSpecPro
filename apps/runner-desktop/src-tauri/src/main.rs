#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod workspace_view;

use serde::{Deserialize, Serialize};
use smartaihub_runner::{
    config::RunnerConfig,
    connection::{
        connect_local_runner, load_connection, load_or_refresh, safe_connect_error_code,
        safe_refresh_error_code, token_expiry_ms,
    },
    diagnostics::{
        connection_status_cancellable, discover_local_tools,
        reset_control_plane_heartbeat_diagnostics, run_local_entrypoint_desktop,
        runner_credential_diagnostics, verify_local_tool,
    },
    discovery::ToolCandidate,
    workspace_registry::{self, LocalWorkspaceDetails},
};
use std::{
    fs,
    path::PathBuf,
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, State, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::DialogExt;

const RUNNER_STOP_TIMEOUT: Duration = Duration::from_secs(30);
const CONTROL_PLANE_HEARTBEAT_FRESHNESS: Duration = Duration::from_secs(5 * 60);

#[derive(Clone)]
struct RunnerLifecycle {
    gate: Arc<Mutex<()>>,
    stop: Arc<Mutex<Option<Arc<AtomicBool>>>>,
    worker: Arc<Mutex<Option<JoinHandle<()>>>>,
    running: Arc<AtomicBool>,
    stopping: Arc<AtomicBool>,
    sync_stop: Arc<AtomicBool>,
    last_error: Arc<Mutex<Option<String>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunnerReadinessStatus {
    tool_inventory: Vec<ToolCandidate>,
    capability_publication_state: String,
    capability_publication_acknowledged_at: Option<String>,
    capability_snapshot_revision: Option<String>,
    capability_publication_correlation_id: Option<String>,
    capability_publication_ack_state: Option<String>,
    capability_publication_http_status: Option<u16>,
    capability_publication_error_code: Option<String>,
}

impl Default for RunnerReadinessStatus {
    fn default() -> Self {
        Self {
            tool_inventory: Vec::new(),
            capability_publication_state: "unknown".into(),
            capability_publication_acknowledged_at: None,
            capability_snapshot_revision: None,
            capability_publication_correlation_id: None,
            capability_publication_ack_state: None,
            capability_publication_http_status: None,
            capability_publication_error_code: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DesktopSettings {
    default_workspace_id: Option<String>,
    auto_start_enabled: bool,
    #[serde(default)]
    first_launch_at_ms: Option<u64>,
}

struct RunnerState {
    config: RunnerConfig,
    app_version: String,
    build_date: String,
    settings_path: PathBuf,
    settings: Mutex<DesktopSettings>,
    lifecycle: RunnerLifecycle,
    readiness: Arc<Mutex<RunnerReadinessStatus>>,
    last_refresh_attempt: Mutex<Option<(Instant, &'static str)>>,
    last_refresh_error: Mutex<Option<String>>,
    last_connect_error_code: Mutex<Option<String>>,
}

const RUNNER_CREDENTIAL_REFRESH_LEAD_MS: u64 = 15 * 60 * 1000;

fn access_token_needs_refresh(expires_at_ms: Option<u64>, now_ms: u64) -> bool {
    expires_at_ms.is_some_and(|expires_at| {
        expires_at <= now_ms.saturating_add(RUNNER_CREDENTIAL_REFRESH_LEAD_MS)
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunnerStatus {
    credentials_ready: bool,
    control_plane_connected: bool,
    last_control_plane_heartbeat_acknowledged_at_ms: Option<u64>,
    running: bool,
    stopping: bool,
    runner_id: String,
    default_workspace_id: Option<String>,
    auto_start_enabled: bool,
    last_error: Option<String>,
    app_version: String,
    build_date: String,
    first_launch_at_ms: Option<u64>,
    access_token_expires_at_ms: Option<u64>,
    reauth_required_by_ms: Option<u64>,
    credential_state: String,
    credential_error_code: Option<String>,
    readiness: RunnerReadinessStatus,
}

fn control_plane_heartbeat_is_fresh(last_acknowledged_at_ms: Option<u64>, now_ms: u64) -> bool {
    last_acknowledged_at_ms.is_some_and(|acknowledged_at_ms| {
        acknowledged_at_ms <= now_ms
            && now_ms - acknowledged_at_ms < CONTROL_PLANE_HEARTBEAT_FRESHNESS.as_millis() as u64
    })
}

fn safe_io_error(_: std::io::Error) -> String {
    "RUNNER_LOCAL_SETTINGS_IO_FAILED".into()
}

fn read_settings(path: &PathBuf) -> Result<DesktopSettings, String> {
    if !path.exists() {
        return Ok(DesktopSettings::default());
    }
    let bytes = fs::read(path).map_err(safe_io_error)?;
    serde_json::from_slice(&bytes).map_err(|_| "RUNNER_LOCAL_SETTINGS_INVALID".into())
}

fn write_settings(path: &PathBuf, value: &DesktopSettings) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "RUNNER_LOCAL_SETTINGS_PATH_INVALID".to_string())?;
    fs::create_dir_all(parent).map_err(safe_io_error)?;
    let temp = parent.join(".desktop_settings.tmp");
    let bytes =
        serde_json::to_vec_pretty(value).map_err(|_| "RUNNER_LOCAL_SETTINGS_SERIALIZE_FAILED")?;
    fs::write(&temp, bytes).map_err(safe_io_error)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temp, fs::Permissions::from_mode(0o600)).map_err(safe_io_error)?;
    }
    fs::rename(temp, path).map_err(safe_io_error)
}

fn app_config(app: &tauri::AppHandle) -> Result<(RunnerConfig, PathBuf), String> {
    let data_root = app
        .path()
        .app_data_dir()
        .map_err(|_| "RUNNER_APP_DATA_PATH_UNAVAILABLE".to_string())?;
    fs::create_dir_all(&data_root).map_err(safe_io_error)?;
    let config = RunnerConfig::local_from_env(&data_root.to_string_lossy())?;
    Ok((config, data_root.join("desktop_settings.json")))
}

fn setting_lock(state: &RunnerState) -> Result<std::sync::MutexGuard<'_, DesktopSettings>, String> {
    state
        .settings
        .lock()
        .map_err(|_| "RUNNER_LOCAL_SETTINGS_LOCK_FAILED".into())
}

fn set_readiness_publication_pending(
    readiness: &Arc<Mutex<RunnerReadinessStatus>>,
) -> Result<(), String> {
    let mut status = readiness
        .lock()
        .map_err(|_| "RUNNER_READINESS_LOCK_FAILED")?;
    status.capability_publication_state = "pending".into();
    status.capability_publication_acknowledged_at = None;
    status.capability_snapshot_revision = None;
    status.capability_publication_correlation_id = None;
    status.capability_publication_ack_state = None;
    status.capability_publication_http_status = None;
    status.capability_publication_error_code = None;
    Ok(())
}

fn apply_capability_publication_diagnostics(
    status: &mut RunnerReadinessStatus,
    diagnostics: &serde_json::Value,
) {
    let ack_state = diagnostics
        .get("lastCapabilityPublicationAckState")
        .and_then(serde_json::Value::as_str);
    let error_code = diagnostics
        .get("lastCapabilityPublicationErrorCode")
        .and_then(serde_json::Value::as_str);
    let acknowledged_at = diagnostics
        .get("lastCapabilityPublicationAcknowledgedAt")
        .and_then(serde_json::Value::as_str);
    if matches!(ack_state, Some("accepted" | "applied" | "duplicate")) && acknowledged_at.is_some()
    {
        status.capability_publication_state = "acknowledged".into();
        status.capability_publication_acknowledged_at = acknowledged_at.map(str::to_string);
        status.capability_snapshot_revision = diagnostics
            .get("lastCapabilitySnapshotRevision")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string);
    } else if ack_state == Some("rejected") || error_code.is_some() {
        status.capability_publication_state = "failed".into();
        status.capability_publication_acknowledged_at = None;
    } else if diagnostics
        .get("lastCapabilityPublicationCorrelationId")
        .and_then(serde_json::Value::as_str)
        .is_some()
        && status.capability_publication_state != "acknowledged"
    {
        status.capability_publication_state = "pending".into();
        status.capability_publication_acknowledged_at = None;
    }
    status.capability_publication_correlation_id = diagnostics
        .get("lastCapabilityPublicationCorrelationId")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string);
    status.capability_publication_ack_state = diagnostics
        .get("lastCapabilityPublicationAckState")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string);
    status.capability_publication_http_status = diagnostics
        .get("lastCapabilityPublicationHttpStatus")
        .and_then(serde_json::Value::as_u64)
        .and_then(|value| u16::try_from(value).ok());
    status.capability_publication_error_code = diagnostics
        .get("lastCapabilityPublicationErrorCode")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string);
}

fn update_tool_readiness(
    readiness: &Arc<Mutex<RunnerReadinessStatus>>,
    tools: &[ToolCandidate],
    force_pending: bool,
) -> Result<(), String> {
    let changed = {
        let mut status = readiness
            .lock()
            .map_err(|_| "RUNNER_READINESS_LOCK_FAILED")?;
        let changed = force_pending
            || status.tool_inventory.len() != tools.len()
            || tools.iter().any(|tool| {
                status
                    .tool_inventory
                    .iter()
                    .find(|current| current.tool_id == tool.tool_id)
                    .is_none_or(|current| {
                        current.fingerprint != tool.fingerprint
                            || current.version_probe_state != tool.version_probe_state
                            || current.task_probe_state != tool.task_probe_state
                            || current.auth_state != tool.auth_state
                            || current.trust_state != tool.trust_state
                    })
            });
        status.tool_inventory = tools.to_vec();
        if changed {
            status.capability_publication_state = "pending".into();
            status.capability_publication_acknowledged_at = None;
            status.capability_snapshot_revision = None;
            status.capability_publication_correlation_id = None;
            status.capability_publication_ack_state = None;
            status.capability_publication_http_status = None;
            status.capability_publication_error_code = None;
        }
        changed
    };
    if changed {
        smartaihub_runner::diagnostics::reset_capability_publication_diagnostics();
    }
    Ok(())
}

fn reset_refresh_backoff_for_manual_retry(
    last_attempt: &mut Option<(Instant, &'static str)>,
    now: Instant,
) -> bool {
    if matches!(
        *last_attempt,
        Some((attempted_at, "renewing"))
            if now.saturating_duration_since(attempted_at) < Duration::from_secs(35)
    ) {
        return false;
    }
    *last_attempt = None;
    true
}

fn refresh_requires_browser_reauthorization(error: &str) -> bool {
    ["_401", "_403", "_409", "REVOKED", "runner_revoked"]
        .iter()
        .any(|marker| error.contains(marker))
}

#[tauri::command]
async fn runner_status(state: State<'_, RunnerState>) -> Result<RunnerStatus, String> {
    let _ = reap_finished_worker(&state.lifecycle);
    let settings = setting_lock(&state)?.clone();
    let mut connection = load_connection(&state.config.data_root)?;
    let mut credential_state = if connection.is_some() {
        "valid"
    } else {
        "disconnected"
    };
    let mut credential_error_code = None;
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64;
    let needs_refresh = connection.as_ref().is_some_and(|saved| {
        access_token_needs_refresh(token_expiry_ms(&saved.control_token), now_ms)
    });
    if needs_refresh {
        let should_attempt = {
            let mut last_attempt = state
                .last_refresh_attempt
                .lock()
                .map_err(|_| "RUNNER_CREDENTIAL_REFRESH_LOCK_FAILED")?;
            match *last_attempt {
                Some((attempted_at, "reauth_required"))
                    if attempted_at.elapsed() < Duration::from_secs(3_600) =>
                {
                    credential_state = "reauth_required";
                    credential_error_code = state
                        .last_refresh_error
                        .lock()
                        .map_err(|_| "RUNNER_CREDENTIAL_REFRESH_LOCK_FAILED")?
                        .clone();
                    false
                }
                Some((attempted_at, "renewing"))
                    if attempted_at.elapsed() < Duration::from_secs(35) =>
                {
                    credential_state = "renewing";
                    false
                }
                Some((attempted_at, "retrying"))
                    if attempted_at.elapsed() < Duration::from_secs(30) =>
                {
                    credential_state = "retrying";
                    credential_error_code = state
                        .last_refresh_error
                        .lock()
                        .map_err(|_| "RUNNER_CREDENTIAL_REFRESH_LOCK_FAILED")?
                        .clone();
                    false
                }
                Some((attempted_at, "renewed"))
                    if attempted_at.elapsed() < Duration::from_secs(30) =>
                {
                    credential_state = "renewed";
                    false
                }
                _ => {
                    *last_attempt = Some((Instant::now(), "renewing"));
                    credential_state = "renewing";
                    true
                }
            }
        };
        if should_attempt {
            let config = state.config.clone();
            match tauri::async_runtime::spawn_blocking(move || load_or_refresh(&config))
                .await
                .map_err(|_| "RUNNER_CREDENTIAL_REFRESH_TASK_FAILED")?
            {
                Ok(refreshed) => {
                    connection = refreshed;
                    credential_state = "renewed";
                    if let Ok(mut last_error) = state.last_refresh_error.lock() {
                        *last_error = None;
                    }
                    if let Ok(mut last_attempt) = state.last_refresh_attempt.lock() {
                        *last_attempt = Some((Instant::now(), "renewed"));
                    }
                }
                Err(error) => {
                    credential_error_code = Some(safe_refresh_error_code(&error));
                    credential_state = if refresh_requires_browser_reauthorization(&error) {
                        "reauth_required"
                    } else {
                        "retrying"
                    };
                    if let Ok(mut last_attempt) = state.last_refresh_attempt.lock() {
                        *last_attempt = Some((Instant::now(), credential_state));
                    }
                    if let Ok(mut last_error) = state.last_refresh_error.lock() {
                        *last_error = credential_error_code.clone();
                    }
                }
            }
        }
    }
    let access_token_expires_at_ms = connection
        .as_ref()
        .and_then(|saved| token_expiry_ms(&saved.control_token));
    let reauth_required_by_ms = connection
        .as_ref()
        .and_then(|saved| token_expiry_ms(&saved.refresh_token));
    let runtime_diagnostics = runner_credential_diagnostics();
    let running = state.lifecycle.running.load(Ordering::Acquire);
    let stopping = state.lifecycle.stopping.load(Ordering::Acquire);
    let credentials_ready = connection.is_some() && matches!(credential_state, "valid" | "renewed");
    let last_control_plane_heartbeat_acknowledged_at_ms = runtime_diagnostics
        .get("lastControlPlaneHeartbeatAcknowledgedAtMs")
        .and_then(serde_json::Value::as_u64);
    let control_plane_connected = credentials_ready
        && running
        && !stopping
        && control_plane_heartbeat_is_fresh(
            last_control_plane_heartbeat_acknowledged_at_ms,
            now_ms,
        );
    let mut readiness = state
        .readiness
        .lock()
        .map_err(|_| "RUNNER_READINESS_LOCK_FAILED")?
        .clone();
    apply_capability_publication_diagnostics(&mut readiness, &runtime_diagnostics);
    Ok(RunnerStatus {
        credentials_ready,
        control_plane_connected,
        last_control_plane_heartbeat_acknowledged_at_ms,
        running,
        stopping,
        runner_id: state.config.runner_id.clone(),
        default_workspace_id: settings.default_workspace_id.clone(),
        auto_start_enabled: settings.auto_start_enabled,
        last_error: state
            .lifecycle
            .last_error
            .lock()
            .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")?
            .clone(),
        app_version: state.app_version.clone(),
        build_date: state.build_date.clone(),
        first_launch_at_ms: settings.first_launch_at_ms,
        access_token_expires_at_ms,
        reauth_required_by_ms,
        credential_state: credential_state.into(),
        credential_error_code,
        readiness,
    })
}

#[tauri::command]
async fn retry_runner_credentials(state: State<'_, RunnerState>) -> Result<RunnerStatus, String> {
    {
        let mut last_attempt = state
            .last_refresh_attempt
            .lock()
            .map_err(|_| "RUNNER_CREDENTIAL_REFRESH_LOCK_FAILED")?;
        reset_refresh_backoff_for_manual_retry(&mut last_attempt, Instant::now());
    }
    runner_status(state).await
}

#[tauri::command]
async fn connect_runner(state: State<'_, RunnerState>) -> Result<String, String> {
    let config = state.config.clone();
    let result = tauri::async_runtime::spawn_blocking(move || connect_local_runner(&config))
        .await
        .map_err(|_| "RUNNER_CONNECT_TASK_FAILED".to_string())?
        .map_err(|error| safe_connect_error_code(&error));
    if let Ok(mut last_error) = state.last_connect_error_code.lock() {
        *last_error = result.as_ref().err().cloned();
    }
    if result.is_ok() {
        if let Ok(mut last_attempt) = state.last_refresh_attempt.lock() {
            *last_attempt = None;
        }
        if let Ok(mut last_error) = state.last_refresh_error.lock() {
            *last_error = None;
        }
    }
    result
}

#[tauri::command]
async fn rescan_runner(
    state: State<'_, RunnerState>,
) -> Result<Vec<smartaihub_runner::discovery::ToolCandidate>, String> {
    let config = state.config.clone();
    let readiness = state.readiness.clone();
    tauri::async_runtime::spawn_blocking(move || discover_local_tools(&config))
        .await
        .map_err(|_| "RUNNER_TOOL_SCAN_TASK_FAILED".to_string())
        .and_then(|tools| {
            update_tool_readiness(&readiness, &tools, false)?;
            Ok(tools)
        })
}

#[tauri::command]
async fn verify_runner_tool(
    tool_id: String,
    state: State<'_, RunnerState>,
) -> Result<smartaihub_runner::diagnostics::ToolVerificationResult, String> {
    let config = state.config.clone();
    let readiness = state.readiness.clone();
    let result = tauri::async_runtime::spawn_blocking(move || verify_local_tool(&config, &tool_id))
        .await
        .map_err(|_| "RUNNER_TOOL_VERIFY_TASK_FAILED".to_string())??;
    let mut tools = readiness
        .lock()
        .map_err(|_| "RUNNER_READINESS_LOCK_FAILED")?
        .tool_inventory
        .clone();
    if let Some(existing) = tools
        .iter_mut()
        .find(|tool| tool.tool_id == result.tool.tool_id)
    {
        *existing = result.tool.clone();
    } else {
        tools.push(result.tool.clone());
    }
    update_tool_readiness(&readiness, &tools, true)?;
    smartaihub_runner::diagnostics::reset_capability_publication_diagnostics();
    Ok(result)
}

/// Publish readiness using the existing authenticated rescan path. This does
/// not enter the control loop, poll commands or execute a task. Serialize with
/// start/stop so a local verification cannot replace a live execution binding.
#[tauri::command]
async fn sync_runner_capabilities(state: State<'_, RunnerState>) -> Result<String, String> {
    let config = state.config.clone();
    let lifecycle = state.lifecycle.clone();
    let readiness = state.readiness.clone();
    if lifecycle.stopping.load(Ordering::Acquire) {
        return Err("RUNNER_SHUTDOWN_IN_PROGRESS".into());
    }
    {
        let mut current = readiness
            .lock()
            .map_err(|_| "RUNNER_READINESS_LOCK_FAILED")?;
        current.capability_publication_state = "pending".into();
        current.capability_publication_acknowledged_at = None;
        current.capability_snapshot_revision = None;
    }
    smartaihub_runner::diagnostics::reset_capability_publication_diagnostics();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let _guard = lifecycle
            .gate
            .lock()
            .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")?;
        if lifecycle.stopping.load(Ordering::Acquire) {
            return Ok("stopping".into());
        }
        if lifecycle.running.load(Ordering::Acquire) {
            smartaihub_runner::diagnostics::request_capability_refresh();
            return Ok("runtime_running".into());
        }
        if load_connection(&config.data_root)?.is_none() {
            return Ok("disconnected".into());
        }
        lifecycle.sync_stop.store(false, Ordering::Release);
        let report = connection_status_cancellable(&config, "rescan", &lifecycle.sync_stop)?;
        let report: serde_json::Value =
            serde_json::from_str(&report).map_err(|_| "RUNNER_CAPABILITY_SYNC_RESPONSE_INVALID")?;
        let accepted = matches!(
            report["delivery"]["ack"].as_str(),
            Some("accepted" | "applied" | "duplicate")
        );
        if accepted && report["state"] == "connected" && report["pendingEvents"] == 0 {
            Ok("synced".into())
        } else {
            Err("RUNNER_CAPABILITY_SYNC_PENDING".into())
        }
    })
    .await
    .map_err(|_| "RUNNER_CAPABILITY_SYNC_TASK_FAILED".to_string())?;
    match result {
        Ok(sync_state) => {
            let mut current = readiness
                .lock()
                .map_err(|_| "RUNNER_READINESS_LOCK_FAILED")?;
            current.capability_publication_state = if sync_state == "synced" {
                "acknowledged".into()
            } else if matches!(sync_state.as_str(), "runtime_running" | "stopping") {
                "pending".into()
            } else {
                "unknown".into()
            };
            let runtime = runner_credential_diagnostics();
            current.capability_publication_acknowledged_at = runtime
                .get("lastCapabilityPublicationAcknowledgedAt")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string);
            current.capability_snapshot_revision = runtime
                .get("lastCapabilitySnapshotRevision")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string);
            apply_capability_publication_diagnostics(&mut current, &runtime);
            Ok(sync_state)
        }
        Err(error) => {
            let mut current = readiness
                .lock()
                .map_err(|_| "RUNNER_READINESS_LOCK_FAILED")?;
            current.capability_publication_state = "failed".into();
            current.capability_publication_acknowledged_at = None;
            current.capability_snapshot_revision = None;
            apply_capability_publication_diagnostics(
                &mut current,
                &smartaihub_runner::diagnostics::runner_credential_diagnostics(),
            );
            Err(error)
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DebugVerificationSummary {
    tool_id: String,
    state: Option<String>,
    reason_code: Option<String>,
}

fn redact_user_paths(value: &str) -> String {
    let mut redacted = value.to_string();
    for key in ["USERPROFILE", "HOME"] {
        if let Some(home) = std::env::var_os(key) {
            let home = home.to_string_lossy();
            if !home.is_empty() {
                redacted = redacted.replace(home.as_ref(), "<USER_HOME>");
            }
        }
    }
    redacted
}

fn safe_debug_code(value: Option<&str>) -> Option<String> {
    let code = value?
        .split(|character: char| !(character.is_ascii_alphanumeric() || character == '_'))
        .next()?;
    let has_safe_prefix = [
        "RUNNER_", "task_", "auth_", "probe_", "version_", "tool_", "cli_",
    ]
    .iter()
    .any(|prefix| code.starts_with(prefix));
    if has_safe_prefix
        && code.len() <= 100
        && code
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
    {
        Some(code.to_string())
    } else {
        None
    }
}

#[tauri::command]
async fn export_runner_debug_report(
    verification_results: Vec<DebugVerificationSummary>,
    state: State<'_, RunnerState>,
) -> Result<serde_json::Value, String> {
    let config = state.config.clone();
    let app_version = state.app_version.clone();
    let build_date = state.build_date.clone();
    let running = state.lifecycle.running.load(Ordering::Acquire);
    let runner_id = config.runner_id.clone();
    let last_error = state
        .lifecycle
        .last_error
        .lock()
        .ok()
        .and_then(|value| value.clone());
    let refresh_error = state
        .last_refresh_error
        .lock()
        .ok()
        .and_then(|value| value.clone());
    let connect_error = state
        .last_connect_error_code
        .lock()
        .ok()
        .and_then(|value| value.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let tools = discover_local_tools(&config);
        let path_entries = std::env::var_os("PATH")
            .map(|path| {
                std::env::split_paths(&path)
                    .take(128)
                    .map(|entry| redact_user_paths(&entry.to_string_lossy()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let current_directory = std::env::current_dir()
            .ok()
            .map(|path| redact_user_paths(&path.to_string_lossy()));
        let tool_reports = tools
            .into_iter()
            .map(|tool| {
                let verification = verification_results
                    .iter()
                    .find(|result| result.tool_id == tool.tool_id);
                serde_json::json!({
                    "toolId": tool.tool_id,
                    "displayName": tool.display_name,
                    "version": tool.version,
                    "adapterId": tool.adapter_id,
                    "discoverySource": tool.discovery_source,
                    "executablePath": tool.executable_path.as_ref().map(|path| redact_user_paths(&path.to_string_lossy())),
                    "trustState": tool.trust_state,
                    "reasonCodes": tool.reason_codes,
                    "testState": verification.and_then(|result| result.state.as_deref()).filter(|state| matches!(*state, "passed" | "failed" | "unsupported")),
                    "testReasonCode": verification.and_then(|result| safe_debug_code(result.reason_code.as_deref())),
                })
            })
            .collect::<Vec<_>>();
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
            .min(u128::from(u64::MAX)) as u64;
        let saved_connection = load_connection(&config.data_root).ok().flatten();
        let access_token_expires_at_ms = saved_connection
            .as_ref()
            .and_then(|saved| token_expiry_ms(&saved.control_token));
        let refresh_token_expires_at_ms = saved_connection
            .as_ref()
            .and_then(|saved| token_expiry_ms(&saved.refresh_token));
        let report = serde_json::json!({
            "schemaVersion": 1,
            "generatedAtUnixMs": now_ms,
            "app": { "version": app_version, "buildDate": build_date },
            "runner": {
                "runnerId": runner_id,
                "hasStoredConnection": saved_connection.is_some(),
                "accessTokenExpiresAtMs": access_token_expires_at_ms,
                "reauthRequiredByMs": refresh_token_expires_at_ms,
                "running": running,
                "lastErrorCode": safe_debug_code(last_error.as_deref()),
                "lastConnectErrorCode": safe_debug_code(connect_error.as_deref()),
                "credentialRefreshErrorCode": safe_debug_code(refresh_error.as_deref()),
                "credentialRuntime": runner_credential_diagnostics(),
            },
            "environment": {
                "os": std::env::consts::OS,
                "architecture": std::env::consts::ARCH,
                "currentDirectory": current_directory,
                "pathEntries": path_entries,
                "secretsIncluded": false,
            },
            "tools": tool_reports,
        });
        let debug_directory = PathBuf::from(&config.data_root).join("debug");
        fs::create_dir_all(&debug_directory).map_err(safe_io_error)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&debug_directory, fs::Permissions::from_mode(0o700)).map_err(safe_io_error)?;
        }
        let file_name = format!("runner-debug-{now_ms}.json");
        let report_path = debug_directory.join(&file_name);
        let bytes = serde_json::to_vec_pretty(&report).map_err(|_| "RUNNER_DEBUG_REPORT_SERIALIZE_FAILED")?;
        fs::write(&report_path, bytes).map_err(safe_io_error)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&report_path, fs::Permissions::from_mode(0o600)).map_err(safe_io_error)?;
        }
        Ok(serde_json::json!({ "path": report_path.to_string_lossy(), "fileName": file_name, "generatedAtUnixMs": now_ms }))
    })
    .await
    .map_err(|_| "RUNNER_DEBUG_REPORT_TASK_FAILED".to_string())?
}

#[tauri::command]
async fn run_workspace_acceptance(
    state: State<'_, RunnerState>,
) -> Result<serde_json::Value, String> {
    let config = state.config.clone();
    let app_version = state.app_version.clone();
    let publication = state
        .readiness
        .lock()
        .map(|status| {
            let safe_state = match status.capability_publication_state.as_str() {
                "unknown" | "pending" | "acknowledged" | "failed" => {
                    status.capability_publication_state.as_str()
                }
                _ => "unknown",
            };
            let safe_ack = match status.capability_publication_ack_state.as_deref() {
                ack @ Some("accepted" | "applied" | "duplicate" | "rejected") => ack,
                _ => None,
            };
            let safe_revision = status
                .capability_snapshot_revision
                .as_deref()
                .filter(|value| {
                    value.len() <= 160
                        && value.bytes().all(|b| {
                            b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.' | b':')
                        })
                });
            let safe_ack_time = status
                .capability_publication_acknowledged_at
                .as_deref()
                .filter(|value| {
                    value.len() <= 40
                        && value.bytes().all(|b| {
                            b.is_ascii_digit()
                                || matches!(b, b'-' | b':' | b'+' | b'.' | b'T' | b'Z')
                        })
                });
            serde_json::json!({
                "state": safe_state,
                "snapshotRevision": safe_revision,
                "ackState": safe_ack,
                "httpStatus": status.capability_publication_http_status,
                "errorCode": safe_debug_code(status.capability_publication_error_code.as_deref()),
                "acknowledgedAt": safe_ack_time,
            })
        })
        .unwrap_or_else(
            |_| serde_json::json!({"state":"unknown","reasonCode":"RUNNER_READINESS_LOCK_FAILED"}),
        );
    tauri::async_runtime::spawn_blocking(move || {
        smartaihub_runner::workspace_acceptance::run(&config, &app_version, publication)
    })
    .await
    .map_err(|_| "WORKSPACE_ACCEPTANCE_TASK_FAILED".to_string())?
}

#[tauri::command]
fn open_runner_debug_folder(state: State<'_, RunnerState>) -> Result<(), String> {
    let folder = PathBuf::from(&state.config.data_root).join("debug");
    fs::create_dir_all(&folder).map_err(safe_io_error)?;
    #[cfg(target_os = "windows")]
    let mut command = Command::new("explorer.exe");
    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = Command::new("xdg-open");
    command.arg(folder);
    command
        .spawn()
        .map_err(|_| "RUNNER_DEBUG_FOLDER_OPEN_FAILED")?;
    Ok(())
}

fn start_runner_inner(state: &RunnerState) -> Result<(), String> {
    let settings = setting_lock(state)?.clone();
    start_runner_parts(
        state.config.clone(),
        settings,
        state.lifecycle.clone(),
        state.readiness.clone(),
    )
}

fn start_runner_parts(
    config: RunnerConfig,
    settings: DesktopSettings,
    lifecycle: RunnerLifecycle,
    readiness: Arc<Mutex<RunnerReadinessStatus>>,
) -> Result<(), String> {
    if lifecycle.stopping.load(Ordering::Acquire) {
        return Err("RUNNER_SHUTDOWN_IN_PROGRESS".into());
    }
    let _lifecycle = lifecycle
        .gate
        .lock()
        .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")?;
    if lifecycle.stopping.load(Ordering::Acquire) {
        return Err("RUNNER_SHUTDOWN_IN_PROGRESS".into());
    }
    reap_finished_worker(&lifecycle)?;
    if lifecycle.running.load(Ordering::Acquire) {
        return Ok(());
    }
    if let Some(workspace_id) = settings.default_workspace_id {
        workspace_registry::resolve(&config, &workspace_id)?;
        std::env::set_var("SAH_RUNNER_DEFAULT_WORKSPACE_ID", workspace_id);
    } else {
        std::env::remove_var("SAH_RUNNER_DEFAULT_WORKSPACE_ID");
    }
    let stop = Arc::new(AtomicBool::new(false));
    *lifecycle
        .stop
        .lock()
        .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")? = Some(stop.clone());
    lifecycle.sync_stop.store(false, Ordering::Release);
    let running = lifecycle.running.clone();
    let last_error = lifecycle.last_error.clone();
    if let Ok(mut error) = last_error.lock() {
        *error = None;
    }
    lifecycle.running.store(true, Ordering::Release);
    lifecycle.stopping.store(false, Ordering::Release);
    set_readiness_publication_pending(&readiness)?;
    smartaihub_runner::diagnostics::reset_capability_publication_diagnostics();
    reset_control_plane_heartbeat_diagnostics();
    let handle = std::thread::Builder::new()
        .name("smartaihub-runner-control".into())
        .spawn(move || {
            let result = run_local_entrypoint_desktop(&config, &stop, |reason| {
                if let Ok(mut error) = last_error.lock() {
                    *error = reason.map(str::to_string);
                }
            });
            running.store(false, Ordering::Release);
            if let Err(error) = result {
                eprintln!("Runner stopped with safe error: {error}");
            }
        })
        .map_err(|_| {
            lifecycle.running.store(false, Ordering::Release);
            "RUNNER_THREAD_START_FAILED"
        })?;
    *lifecycle
        .worker
        .lock()
        .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")? = Some(handle);
    Ok(())
}

fn stop_runner_inner(lifecycle: RunnerLifecycle) -> Result<(), String> {
    let _lifecycle = lifecycle
        .gate
        .lock()
        .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")?;
    if let Some(stop) = lifecycle
        .stop
        .lock()
        .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")?
        .as_ref()
    {
        stop.store(true, Ordering::Release);
    }
    lifecycle.sync_stop.store(true, Ordering::Release);
    let worker = lifecycle
        .worker
        .lock()
        .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")?
        .take();
    let Some(worker) = worker else {
        lifecycle.running.store(false, Ordering::Release);
        lifecycle.stopping.store(false, Ordering::Release);
        if let Ok(mut stop) = lifecycle.stop.lock() {
            *stop = None;
        }
        std::env::remove_var("SAH_RUNNER_DEFAULT_WORKSPACE_ID");
        return Ok(());
    };
    let deadline = Instant::now() + RUNNER_STOP_TIMEOUT;
    while !worker.is_finished() {
        if Instant::now() >= deadline {
            *lifecycle
                .worker
                .lock()
                .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")? = Some(worker);
            if let Ok(mut last_error) = lifecycle.last_error.lock() {
                *last_error = Some("RUNNER_STOP_TIMEOUT".into());
            }
            return Err("RUNNER_STOP_TIMEOUT".into());
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let join_failed = worker.join().is_err();
    lifecycle.running.store(false, Ordering::Release);
    lifecycle.stopping.store(false, Ordering::Release);
    if let Ok(mut stop) = lifecycle.stop.lock() {
        *stop = None;
    }
    std::env::remove_var("SAH_RUNNER_DEFAULT_WORKSPACE_ID");
    if join_failed {
        if let Ok(mut last_error) = lifecycle.last_error.lock() {
            *last_error = Some("RUNNER_THREAD_JOIN_FAILED".into());
        }
        return Err("RUNNER_THREAD_JOIN_FAILED".into());
    }
    if let Ok(mut last_error) = lifecycle.last_error.lock() {
        if last_error.as_deref() == Some("RUNNER_STOP_TIMEOUT") {
            *last_error = None;
        }
    }
    Ok(())
}

fn reap_finished_worker(lifecycle: &RunnerLifecycle) -> Result<(), String> {
    let finished = lifecycle
        .worker
        .lock()
        .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")?
        .as_ref()
        .is_some_and(JoinHandle::is_finished);
    if !finished {
        return Ok(());
    }
    let worker = lifecycle
        .worker
        .lock()
        .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")?
        .take();
    if let Some(worker) = worker {
        let join_failed = worker.join().is_err();
        lifecycle.running.store(false, Ordering::Release);
        lifecycle.stopping.store(false, Ordering::Release);
        if let Ok(mut stop) = lifecycle.stop.lock() {
            *stop = None;
        }
        std::env::remove_var("SAH_RUNNER_DEFAULT_WORKSPACE_ID");
        if join_failed {
            if let Ok(mut last_error) = lifecycle.last_error.lock() {
                *last_error = Some("RUNNER_THREAD_JOIN_FAILED".into());
            }
        } else if let Ok(mut last_error) = lifecycle.last_error.lock() {
            if last_error.as_deref() == Some("RUNNER_STOP_TIMEOUT") {
                *last_error = None;
            }
        }
    }
    Ok(())
}

#[tauri::command]
async fn start_runner(state: State<'_, RunnerState>) -> Result<(), String> {
    let settings = setting_lock(&state)?.clone();
    let config = state.config.clone();
    let lifecycle = state.lifecycle.clone();
    let readiness = state.readiness.clone();
    tauri::async_runtime::spawn_blocking(move || {
        start_runner_parts(config, settings, lifecycle, readiness)
    })
    .await
    .map_err(|_| "RUNNER_START_TASK_FAILED".to_string())?
}

#[tauri::command]
async fn stop_runner(state: State<'_, RunnerState>) -> Result<(), String> {
    let lifecycle = state.lifecycle.clone();
    lifecycle.stopping.store(true, Ordering::Release);
    lifecycle.sync_stop.store(true, Ordering::Release);
    tauri::async_runtime::spawn_blocking(move || stop_runner_inner(lifecycle))
        .await
        .map_err(|_| "RUNNER_STOP_TASK_FAILED".to_string())?
}

#[tauri::command]
fn list_workspaces(
    state: State<'_, RunnerState>,
    mode: Option<String>,
) -> Result<Vec<workspace_view::WorkspaceView>, String> {
    workspace_view::list(&state.config, mode.as_deref() == Some("developer"))
}

#[tauri::command]
fn bind_workspace_identity(
    workspace_id: String,
    project_id: Option<String>,
    repository_id: Option<String>,
    state: State<'_, RunnerState>,
) -> Result<(), String> {
    let _lifecycle = state
        .lifecycle
        .gate
        .lock()
        .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")?;
    workspace_view::bind(
        &state.config,
        state.lifecycle.running.load(Ordering::Acquire)
            || state.lifecycle.stopping.load(Ordering::Acquire),
        &workspace_id,
        project_id.as_deref(),
        repository_id.as_deref(),
    )
}

#[tauri::command]
async fn add_workspace(
    app: tauri::AppHandle,
    state: State<'_, RunnerState>,
) -> Result<Option<LocalWorkspaceDetails>, String> {
    let Some(path) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let local_path = path
        .into_path()
        .map_err(|_| "RUNNER_WORKSPACE_SELECTION_INVALID")?;
    let entry = workspace_registry::register(&state.config, &local_path)?;
    Ok(Some(LocalWorkspaceDetails {
        workspace_id: entry.workspace_id,
        display_name: entry.display_name,
        local_path,
    }))
}

#[tauri::command]
fn remove_workspace(workspace_id: String, state: State<'_, RunnerState>) -> Result<bool, String> {
    if state.lifecycle.running.load(Ordering::Acquire)
        || state.lifecycle.stopping.load(Ordering::Acquire)
    {
        return Err("RUNNER_WORKSPACE_REQUIRES_STOP".into());
    }
    let was_default = setting_lock(&state)?.default_workspace_id.as_deref() == Some(&workspace_id);
    let removed = workspace_registry::remove(&state.config, &workspace_id)?;
    if removed && was_default {
        set_default_workspace_id(&state, None)?;
    }
    Ok(removed)
}

fn set_default_workspace_id(
    state: &RunnerState,
    workspace_id: Option<String>,
) -> Result<(), String> {
    if state.lifecycle.running.load(Ordering::Acquire)
        || state.lifecycle.stopping.load(Ordering::Acquire)
    {
        return Err("RUNNER_DEFAULT_WORKSPACE_REQUIRES_STOP".into());
    }
    if let Some(id) = workspace_id.as_deref() {
        workspace_registry::resolve(&state.config, id)?;
    }
    let mut settings = setting_lock(state)?;
    let previous = settings.default_workspace_id.clone();
    settings.default_workspace_id = workspace_id;
    if let Err(error) = write_settings(&state.settings_path, &settings) {
        settings.default_workspace_id = previous;
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
fn set_default_workspace(
    workspace_id: Option<String>,
    state: State<'_, RunnerState>,
) -> Result<(), String> {
    set_default_workspace_id(&state, workspace_id)
}

#[tauri::command]
fn set_auto_start(
    enabled: bool,
    app: tauri::AppHandle,
    state: State<'_, RunnerState>,
) -> Result<(), String> {
    if enabled && load_connection(&state.config.data_root)?.is_none() {
        return Err("RUNNER_AUTO_START_REQUIRES_CONNECTION".into());
    }
    let manager = app.autolaunch();
    if enabled {
        manager
            .enable()
            .map_err(|_| "RUNNER_AUTO_START_ENABLE_FAILED")?;
    } else {
        manager
            .disable()
            .map_err(|_| "RUNNER_AUTO_START_DISABLE_FAILED")?;
    }
    let mut settings = setting_lock(&state)?;
    let previous = settings.auto_start_enabled;
    settings.auto_start_enabled = enabled;
    if let Err(error) = write_settings(&state.settings_path, &settings) {
        settings.auto_start_enabled = previous;
        if enabled {
            let _ = manager.disable();
        } else {
            let _ = manager.enable();
        }
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
async fn quit_runner(app: tauri::AppHandle, state: State<'_, RunnerState>) -> Result<(), String> {
    let lifecycle = state.lifecycle.clone();
    lifecycle.stopping.store(true, Ordering::Release);
    lifecycle.sync_stop.store(true, Ordering::Release);
    tauri::async_runtime::spawn_blocking(move || stop_runner_inner(lifecycle))
        .await
        .map_err(|_| "RUNNER_STOP_TASK_FAILED".to_string())??;
    app.exit(0);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--background"])
                .app_name("SmartAIHub Runner")
                .build(),
        )
        .setup(|app| {
            let (config, settings_path) =
                app_config(app.handle()).map_err(std::io::Error::other)?;
            let mut settings = read_settings(&settings_path).map_err(std::io::Error::other)?;
            if settings.first_launch_at_ms.is_none() {
                settings.first_launch_at_ms = Some(
                    SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis()
                        .min(u128::from(u64::MAX)) as u64,
                );
                write_settings(&settings_path, &settings).map_err(std::io::Error::other)?;
            }
            app.manage(RunnerState {
                config,
                app_version: app.package_info().version.to_string(),
                build_date: option_env!("SAH_RUNNER_BUILD_DATE")
                    .unwrap_or("local build")
                    .to_string(),
                settings_path,
                settings: Mutex::new(settings.clone()),
                lifecycle: RunnerLifecycle {
                    gate: Arc::new(Mutex::new(())),
                    stop: Arc::new(Mutex::new(None)),
                    worker: Arc::new(Mutex::new(None)),
                    running: Arc::new(AtomicBool::new(false)),
                    stopping: Arc::new(AtomicBool::new(false)),
                    sync_stop: Arc::new(AtomicBool::new(false)),
                    last_error: Arc::new(Mutex::new(None)),
                },
                readiness: Arc::new(Mutex::new(RunnerReadinessStatus::default())),
                last_refresh_attempt: Mutex::new(None),
                last_refresh_error: Mutex::new(None),
                last_connect_error_code: Mutex::new(None),
            });

            let open =
                MenuItem::with_id(app, "open", "Open SmartAIHub Runner", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Runner", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let tray_icon = app
                .default_window_icon()
                .cloned()
                .ok_or_else(|| std::io::Error::other("Runner tray icon missing"))?;
            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("SmartAIHub Runner")
                .icon(tray_icon)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        if let Some(state) = app.try_state::<RunnerState>() {
                            let lifecycle = state.lifecycle.clone();
                            lifecycle.stopping.store(true, Ordering::Release);
                            lifecycle.sync_stop.store(true, Ordering::Release);
                            let app_handle = app.clone();
                            tauri::async_runtime::spawn_blocking(move || {
                                let result = stop_runner_inner(lifecycle.clone());
                                if let Err(error) = result {
                                    if let Ok(mut last_error) = lifecycle.last_error.lock() {
                                        *last_error = Some(error);
                                    }
                                    if let Some(window) = app_handle.get_webview_window("main") {
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                } else {
                                    app_handle.exit(0);
                                }
                            });
                        } else {
                            app.exit(0);
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            let is_background = std::env::args().any(|argument| argument == "--background");
            if is_background {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
                if settings.auto_start_enabled {
                    if let Some(state) = app.try_state::<RunnerState>() {
                        if let Err(error) = start_runner_inner(&state) {
                            if let Ok(mut last_error) = state.lifecycle.last_error.lock() {
                                *last_error = Some(
                                    if error.starts_with("RUNNER_TRUSTED_WORKSPACE")
                                        || error.starts_with("RUNNER_WORKSPACE")
                                    {
                                        "RUNNER_WORKSPACE_NEEDS_RESELECT".into()
                                    } else {
                                        "RUNNER_AUTOSTART_FAILED".into()
                                    },
                                );
                            }
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                            }
                        }
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            runner_status,
            retry_runner_credentials,
            connect_runner,
            rescan_runner,
            sync_runner_capabilities,
            verify_runner_tool,
            export_runner_debug_report,
            run_workspace_acceptance,
            open_runner_debug_folder,
            start_runner,
            stop_runner,
            list_workspaces,
            bind_workspace_identity,
            add_workspace,
            remove_workspace,
            set_default_workspace,
            set_auto_start,
            quit_runner
        ])
        .run(tauri::generate_context!())
        .expect("failed to run SmartAIHub Runner");
}

#[cfg(test)]
mod debug_report_tests {
    use super::safe_debug_code;

    #[test]
    fn debug_report_keeps_only_known_error_code_shapes() {
        assert_eq!(
            safe_debug_code(Some("RUNNER_CREDENTIAL_REFRESH_FAILED: details")),
            Some("RUNNER_CREDENTIAL_REFRESH_FAILED".into())
        );
        assert_eq!(
            safe_debug_code(Some("probe_timeout: details")),
            Some("probe_timeout".into())
        );
        assert_eq!(safe_debug_code(Some("secret-token-value")), None);
    }
}

#[cfg(test)]
mod credential_retry_tests {
    use super::{
        access_token_needs_refresh, refresh_requires_browser_reauthorization,
        reset_refresh_backoff_for_manual_retry, RUNNER_CREDENTIAL_REFRESH_LEAD_MS,
    };
    use std::time::{Duration, Instant};

    #[test]
    fn refresh_conflicts_require_browser_reauthorization_but_server_errors_retry() {
        assert!(refresh_requires_browser_reauthorization(
            "RUNNER_CONNECT_REQUEST_REJECTED_409"
        ));
        assert!(refresh_requires_browser_reauthorization(
            "RUNNER_CONNECT_REQUEST_REJECTED_401"
        ));
        assert!(!refresh_requires_browser_reauthorization(
            "RUNNER_CONNECT_REQUEST_REJECTED_503"
        ));
    }

    #[test]
    fn manual_retry_clears_retry_and_reauth_backoff() {
        let now = Instant::now();
        for state in ["retrying", "reauth_required"] {
            let mut last_attempt = Some((now - Duration::from_secs(5), state));
            assert!(reset_refresh_backoff_for_manual_retry(
                &mut last_attempt,
                now
            ));
            assert!(last_attempt.is_none());
        }
    }

    #[test]
    fn manual_retry_does_not_duplicate_an_in_flight_refresh() {
        let now = Instant::now();
        let attempt = now - Duration::from_secs(5);
        let mut last_attempt = Some((attempt, "renewing"));
        assert!(!reset_refresh_backoff_for_manual_retry(
            &mut last_attempt,
            now
        ));
        assert_eq!(
            last_attempt.map(|(at, state)| (at, state)),
            Some((attempt, "renewing"))
        );
    }

    #[test]
    fn access_token_refresh_starts_fifteen_minutes_before_expiry() {
        let now = 1_000_000;
        assert!(!access_token_needs_refresh(
            Some(now + RUNNER_CREDENTIAL_REFRESH_LEAD_MS + 1),
            now
        ));
        assert!(access_token_needs_refresh(
            Some(now + RUNNER_CREDENTIAL_REFRESH_LEAD_MS),
            now
        ));
        assert!(access_token_needs_refresh(Some(now + 1), now));
        assert!(!access_token_needs_refresh(None, now));
    }
}

#[cfg(test)]
mod control_plane_heartbeat_tests {
    use super::control_plane_heartbeat_is_fresh;

    #[test]
    fn heartbeat_requires_a_recent_acknowledgment_and_rejects_future_or_missing_times() {
        assert!(control_plane_heartbeat_is_fresh(Some(700_001), 1_000_000));
        assert!(!control_plane_heartbeat_is_fresh(Some(700_000), 1_000_000));
        assert!(!control_plane_heartbeat_is_fresh(
            Some(1_000_001),
            1_000_000
        ));
        assert!(!control_plane_heartbeat_is_fresh(None, 1_000_000));
    }
}

#[cfg(test)]
mod capability_publication_projection_tests {
    use super::{apply_capability_publication_diagnostics, RunnerReadinessStatus};
    use serde_json::json;

    #[test]
    fn failed_publication_stays_failed_after_credential_refresh_without_a_new_attempt() {
        let mut status = RunnerReadinessStatus {
            capability_publication_state: "failed".into(),
            ..RunnerReadinessStatus::default()
        };
        apply_capability_publication_diagnostics(
            &mut status,
            &json!({
                "runtimeCredentialUpdated": true,
                "lastCapabilityPublicationCorrelationId": null,
                "lastCapabilityPublicationAckState": null,
                "lastCapabilityPublicationErrorCode": null,
            }),
        );
        assert_eq!(status.capability_publication_state, "failed");
    }

    #[test]
    fn rejected_ack_projects_failed_with_safe_diagnostics() {
        let mut status = RunnerReadinessStatus::default();
        apply_capability_publication_diagnostics(
            &mut status,
            &json!({
                "lastCapabilityPublicationCorrelationId": "runner:test:capability",
                "lastCapabilityPublicationAckState": "rejected",
                "lastCapabilityPublicationHttpStatus": 403,
                "lastCapabilityPublicationErrorCode": "RUNNER_SESSION_INVALID",
                "lastCapabilitySnapshotRevision": "snapshot:test:2",
            }),
        );
        assert_eq!(status.capability_publication_state, "failed");
        assert_eq!(
            status.capability_publication_correlation_id.as_deref(),
            Some("runner:test:capability")
        );
        assert_eq!(status.capability_publication_http_status, Some(403));
        assert_eq!(
            status.capability_publication_error_code.as_deref(),
            Some("RUNNER_SESSION_INVALID")
        );
    }
}
