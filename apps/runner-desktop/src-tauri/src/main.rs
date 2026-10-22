#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod workspace_view;

use serde::{Deserialize, Serialize};
use smartaihub_runner::{
    companion_auth,
    config::RunnerConfig,
    connection::{
        connect_local_runner, load_connection, load_or_refresh, safe_refresh_error_code,
        token_expiry_ms,
    },
    diagnostics::{
        connection_status, discover_local_tools, run_local_entrypoint_desktop,
        runner_credential_diagnostics, verify_local_tool,
    },
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
    Manager, PhysicalPosition, PhysicalRect, PhysicalSize, State, WebviewWindow, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;

const COMPANION_MIN_WIDTH: u32 = 320;
const COMPANION_MAX_WIDTH: u32 = 560;
const COMPANION_MIN_HEIGHT: u32 = 150;
const COMPANION_MAX_HEIGHT: u32 = 420;
const COMPANION_COMPACT_HEIGHT: u32 = 178;
const COMPANION_EXPANDED_HEIGHT: u32 = COMPANION_MAX_HEIGHT;
const COMPANION_EDGE_GUTTER: i32 = 12;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct CompanionBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

impl Default for CompanionBounds {
    fn default() -> Self {
        Self {
            x: 24,
            y: 24,
            width: 380,
            height: 178,
        }
    }
}

impl CompanionBounds {
    fn bounded(self) -> Self {
        Self {
            x: self.x,
            y: self.y,
            width: self.width.clamp(COMPANION_MIN_WIDTH, COMPANION_MAX_WIDTH),
            height: self
                .height
                .clamp(COMPANION_MIN_HEIGHT, COMPANION_MAX_HEIGHT),
        }
    }

    fn fit_work_area(self, work_area: &PhysicalRect<i32, u32>) -> Self {
        let bounds = self.bounded();
        let width = bounds.width.min(work_area.size.width.saturating_sub(16));
        let height = bounds.height.min(work_area.size.height.saturating_sub(16));
        let min_x = i64::from(work_area.position.x) + i64::from(COMPANION_EDGE_GUTTER);
        let min_y = i64::from(work_area.position.y) + i64::from(COMPANION_EDGE_GUTTER);
        let max_x = i64::from(work_area.position.x) + i64::from(work_area.size.width)
            - i64::from(width)
            - i64::from(COMPANION_EDGE_GUTTER);
        let max_y = i64::from(work_area.position.y) + i64::from(work_area.size.height)
            - i64::from(height)
            - i64::from(COMPANION_EDGE_GUTTER);
        Self {
            x: i64::from(bounds.x).clamp(min_x, max_x) as i32,
            y: i64::from(bounds.y).clamp(min_y, max_y) as i32,
            width,
            height,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct CompanionPreferences {
    #[serde(default)]
    always_on_top: bool,
    #[serde(default)]
    edge_dock: bool,
    #[serde(default = "default_companion_theme")]
    theme: String,
    #[serde(default)]
    bounds: CompanionBounds,
}

fn default_companion_theme() -> String {
    "system".into()
}

impl Default for CompanionPreferences {
    fn default() -> Self {
        Self {
            always_on_top: false,
            edge_dock: true,
            theme: default_companion_theme(),
            bounds: CompanionBounds::default(),
        }
    }
}

fn valid_companion_theme(theme: &str) -> bool {
    matches!(theme, "system" | "light" | "dark")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSettings {
    default_workspace_id: Option<String>,
    auto_start_enabled: bool,
    #[serde(default)]
    first_launch_at_ms: Option<u64>,
    #[serde(default = "default_companion_enabled")]
    companion_enabled: bool,
    #[serde(default)]
    companion: CompanionPreferences,
}

fn default_companion_enabled() -> bool {
    true
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            default_workspace_id: None,
            auto_start_enabled: false,
            first_launch_at_ms: None,
            companion_enabled: default_companion_enabled(),
            companion: CompanionPreferences::default(),
        }
    }
}

struct RunnerState {
    config: RunnerConfig,
    app_version: String,
    build_date: String,
    settings_path: PathBuf,
    settings: Mutex<DesktopSettings>,
    stop: Mutex<Option<Arc<AtomicBool>>>,
    worker: Mutex<Option<JoinHandle<()>>>,
    running: Arc<AtomicBool>,
    last_error: Arc<Mutex<Option<String>>>,
    lifecycle: Arc<Mutex<()>>,
    last_refresh_attempt: Mutex<Option<(Instant, &'static str)>>,
    last_refresh_error: Mutex<Option<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunnerStatus {
    connected: bool,
    running: bool,
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

fn companion_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("companion")
        .ok_or_else(|| "RUNNER_COMPANION_WINDOW_UNAVAILABLE".into())
}

fn current_work_area(window: &WebviewWindow) -> Result<PhysicalRect<i32, u32>, String> {
    if let Some(monitor) = window
        .current_monitor()
        .map_err(|_| "RUNNER_COMPANION_MONITOR_UNAVAILABLE".to_string())?
    {
        return Ok(*monitor.work_area());
    }
    window
        .primary_monitor()
        .map_err(|_| "RUNNER_COMPANION_MONITOR_UNAVAILABLE".to_string())?
        .map(|monitor| *monitor.work_area())
        .ok_or_else(|| "RUNNER_COMPANION_MONITOR_UNAVAILABLE".into())
}

fn apply_companion_preferences(
    window: &WebviewWindow,
    preferences: &CompanionPreferences,
) -> Result<(), String> {
    let work_area = current_work_area(window)?;
    let bounds = preferences.bounds.clone().fit_work_area(&work_area);
    window
        .set_position(PhysicalPosition::new(bounds.x, bounds.y))
        .map_err(|_| "RUNNER_COMPANION_POSITION_FAILED".to_string())?;
    window
        .set_size(PhysicalSize::new(bounds.width, bounds.height))
        .map_err(|_| "RUNNER_COMPANION_SIZE_FAILED".to_string())?;
    window
        .set_always_on_top(preferences.always_on_top)
        .map_err(|_| "RUNNER_COMPANION_TOPMOST_FAILED".to_string())
}

fn remember_companion_bounds(
    state: &RunnerState,
    window: &WebviewWindow,
) -> Result<CompanionBounds, String> {
    let position = window
        .outer_position()
        .map_err(|_| "RUNNER_COMPANION_POSITION_UNAVAILABLE".to_string())?;
    let size = window
        .outer_size()
        .map_err(|_| "RUNNER_COMPANION_SIZE_UNAVAILABLE".to_string())?;
    let bounds = CompanionBounds {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    }
    .bounded();
    let work_area = current_work_area(window)?;
    let bounds = bounds.fit_work_area(&work_area);
    let mut settings = setting_lock(state)?;
    settings.companion.bounds = bounds.clone();
    write_settings(&state.settings_path, &settings)?;
    Ok(bounds)
}

fn snap_bounds_to_nearest_edge(
    current: CompanionBounds,
    work_area: &PhysicalRect<i32, u32>,
) -> CompanionBounds {
    let current = current.fit_work_area(work_area);
    let center_x = i64::from(current.x) + i64::from(current.width / 2);
    let center_y = i64::from(current.y) + i64::from(current.height / 2);
    let work_right = i64::from(work_area.position.x) + i64::from(work_area.size.width);
    let work_bottom = i64::from(work_area.position.y) + i64::from(work_area.size.height);
    let distances = [
        ("left", (center_x - i64::from(work_area.position.x)).abs()),
        ("right", (work_right - center_x).abs()),
        ("top", (center_y - i64::from(work_area.position.y)).abs()),
        ("bottom", (work_bottom - center_y).abs()),
    ];
    let edge = distances
        .into_iter()
        .min_by_key(|(_, distance)| *distance)
        .map(|(edge, _)| edge)
        .unwrap_or("right");
    let mut snapped = current;
    match edge {
        "left" => snapped.x = work_area.position.x + COMPANION_EDGE_GUTTER,
        "right" => snapped.x = work_right as i32 - snapped.width as i32 - COMPANION_EDGE_GUTTER,
        "top" => snapped.y = work_area.position.y + COMPANION_EDGE_GUTTER,
        _ => snapped.y = work_bottom as i32 - snapped.height as i32 - COMPANION_EDGE_GUTTER,
    }
    snapped.fit_work_area(work_area)
}

fn companion_height_for_expanded(expanded: bool) -> u32 {
    if expanded {
        COMPANION_EXPANDED_HEIGHT
    } else {
        COMPANION_COMPACT_HEIGHT
    }
}

fn resize_companion_bounds(
    current: CompanionBounds,
    expanded: bool,
    work_area: &PhysicalRect<i32, u32>,
) -> CompanionBounds {
    CompanionBounds {
        height: companion_height_for_expanded(expanded),
        ..current
    }
    .fit_work_area(work_area)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompanionProjectionStatus {
    schema_version: &'static str,
    availability: &'static str,
    authentication: &'static str,
    transport: &'static str,
    reason_code: &'static str,
    detail: &'static str,
}

/// The Runner access token authenticates the device control channel, not the
/// browser user's tenant-scoped Task Control projection. Keep this explicit
/// until an authorized desktop projection transport is added server-side.
#[tauri::command]
fn companion_projection_status() -> CompanionProjectionStatus {
    CompanionProjectionStatus {
        schema_version: "runner-companion.v1",
        availability: "unavailable",
        authentication: "runner_device_only",
        transport: "not_configured",
        reason_code: "RUNNER_COMPANION_USER_PROJECTION_AUTH_REQUIRED",
        detail: "Task Control projection requires an authenticated user-scoped desktop transport; browser cookies and Runner device credentials are not interchangeable.",
    }
}

#[tauri::command]
fn companion_auth_status(
    state: State<'_, RunnerState>,
) -> smartaihub_runner::companion_auth::CompanionAuthStatus {
    companion_auth::status(&state.config.data_root)
}

#[tauri::command]
async fn start_companion_auth(
    state: State<'_, RunnerState>,
) -> Result<smartaihub_runner::companion_auth::CompanionAuthStart, String> {
    let control_url = state
        .config
        .control_url
        .clone()
        .ok_or_else(|| "RUNNER_COMPANION_ENDPOINT_INVALID".to_string())?;
    let data_root = state.config.data_root.clone();
    tauri::async_runtime::spawn_blocking(move || companion_auth::begin_auth(&control_url, &data_root))
        .await
        .map_err(|_| "RUNNER_COMPANION_AUTH_TASK_FAILED".to_string())?
}

#[tauri::command]
async fn poll_companion_auth(
    state: State<'_, RunnerState>,
) -> Result<smartaihub_runner::companion_auth::CompanionAuthPoll, String> {
    let data_root = state.config.data_root.clone();
    tauri::async_runtime::spawn_blocking(move || companion_auth::poll_auth(&data_root))
        .await
        .map_err(|_| "RUNNER_COMPANION_AUTH_TASK_FAILED".to_string())?
}

#[tauri::command]
async fn companion_state(state: State<'_, RunnerState>) -> Result<serde_json::Value, String> {
    let data_root = state.config.data_root.clone();
    tauri::async_runtime::spawn_blocking(move || companion_auth::fetch_state(&data_root))
        .await
        .map_err(|_| "RUNNER_COMPANION_PROJECTION_TASK_FAILED".to_string())?
}

#[tauri::command]
async fn logout_companion(state: State<'_, RunnerState>) -> Result<(), String> {
    let data_root = state.config.data_root.clone();
    tauri::async_runtime::spawn_blocking(move || companion_auth::logout(&data_root))
        .await
        .map_err(|_| "RUNNER_COMPANION_LOGOUT_TASK_FAILED".to_string())?
}

#[tauri::command]
fn companion_preferences(state: State<'_, RunnerState>) -> Result<CompanionPreferences, String> {
    Ok(setting_lock(&state)?.companion.clone())
}

#[tauri::command]
fn set_companion_preferences(
    theme: String,
    always_on_top: bool,
    edge_dock: bool,
    app: tauri::AppHandle,
    state: State<'_, RunnerState>,
) -> Result<CompanionPreferences, String> {
    if !valid_companion_theme(&theme) {
        return Err("RUNNER_COMPANION_THEME_INVALID".into());
    }
    let mut settings = setting_lock(&state)?;
    settings.companion.theme = theme;
    settings.companion.always_on_top = always_on_top;
    settings.companion.edge_dock = edge_dock;
    settings.companion.bounds = settings.companion.bounds.clone().bounded();
    let next = settings.companion.clone();
    write_settings(&state.settings_path, &settings)?;
    drop(settings);
    if let Some(window) = app.get_webview_window("companion") {
        window
            .set_always_on_top(next.always_on_top)
            .map_err(|_| "RUNNER_COMPANION_TOPMOST_FAILED")?;
    }
    Ok(next)
}

#[tauri::command]
fn show_companion(app: tauri::AppHandle, state: State<'_, RunnerState>) -> Result<(), String> {
    let preferences = setting_lock(&state)?.companion.clone();
    let window = companion_window(&app)?;
    apply_companion_preferences(&window, &preferences)?;
    window
        .show()
        .map_err(|_| "RUNNER_COMPANION_SHOW_FAILED".to_string())?;
    window
        .set_focus()
        .map_err(|_| "RUNNER_COMPANION_FOCUS_FAILED".to_string())
}

#[tauri::command]
fn hide_companion(app: tauri::AppHandle, state: State<'_, RunnerState>) -> Result<(), String> {
    let window = companion_window(&app)?;
    let _ = remember_companion_bounds(&state, &window);
    window
        .hide()
        .map_err(|_| "RUNNER_COMPANION_HIDE_FAILED".to_string())
}

#[tauri::command]
fn toggle_companion(app: tauri::AppHandle, state: State<'_, RunnerState>) -> Result<bool, String> {
    let window = companion_window(&app)?;
    if window
        .is_visible()
        .map_err(|_| "RUNNER_COMPANION_VISIBILITY_FAILED".to_string())?
    {
        let _ = remember_companion_bounds(&state, &window);
        window
            .hide()
            .map_err(|_| "RUNNER_COMPANION_HIDE_FAILED".to_string())?;
        Ok(false)
    } else {
        show_companion(app, state)?;
        Ok(true)
    }
}

#[tauri::command]
fn open_runner_settings(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "RUNNER_SETTINGS_WINDOW_UNAVAILABLE".to_string())?;
    window
        .show()
        .map_err(|_| "RUNNER_SETTINGS_SHOW_FAILED".to_string())?;
    window
        .set_focus()
        .map_err(|_| "RUNNER_SETTINGS_FOCUS_FAILED".to_string())
}

#[tauri::command]
fn snap_companion_to_edge(
    app: tauri::AppHandle,
    state: State<'_, RunnerState>,
) -> Result<CompanionBounds, String> {
    let window = companion_window(&app)?;
    let work_area = current_work_area(&window)?;
    let current = CompanionBounds {
        x: window
            .outer_position()
            .map_err(|_| "RUNNER_COMPANION_POSITION_UNAVAILABLE".to_string())?
            .x,
        y: window
            .outer_position()
            .map_err(|_| "RUNNER_COMPANION_POSITION_UNAVAILABLE".to_string())?
            .y,
        width: window
            .outer_size()
            .map_err(|_| "RUNNER_COMPANION_SIZE_UNAVAILABLE".to_string())?
            .width,
        height: window
            .outer_size()
            .map_err(|_| "RUNNER_COMPANION_SIZE_UNAVAILABLE".to_string())?
            .height,
    };
    let snapped = snap_bounds_to_nearest_edge(current, &work_area);
    window
        .set_position(PhysicalPosition::new(snapped.x, snapped.y))
        .map_err(|_| "RUNNER_COMPANION_POSITION_FAILED".to_string())?;
    let mut settings = setting_lock(&state)?;
    settings.companion.bounds = snapped.clone();
    settings.companion.edge_dock = true;
    write_settings(&state.settings_path, &settings)?;
    Ok(snapped)
}

#[tauri::command]
fn set_companion_expanded(
    expanded: bool,
    app: tauri::AppHandle,
    state: State<'_, RunnerState>,
) -> Result<CompanionBounds, String> {
    let window = companion_window(&app)?;
    let work_area = current_work_area(&window)?;
    let position = window
        .outer_position()
        .map_err(|_| "RUNNER_COMPANION_POSITION_UNAVAILABLE".to_string())?;
    let size = window
        .outer_size()
        .map_err(|_| "RUNNER_COMPANION_SIZE_UNAVAILABLE".to_string())?;
    let current = CompanionBounds {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    };
    let next = resize_companion_bounds(current, expanded, &work_area);
    window
        .set_position(PhysicalPosition::new(next.x, next.y))
        .map_err(|_| "RUNNER_COMPANION_POSITION_FAILED".to_string())?;
    window
        .set_size(PhysicalSize::new(next.width, next.height))
        .map_err(|_| "RUNNER_COMPANION_SIZE_FAILED".to_string())?;
    let mut settings = setting_lock(&state)?;
    settings.companion.bounds = next.clone();
    write_settings(&state.settings_path, &settings)?;
    Ok(next)
}

#[tauri::command]
fn notify_companion(kind: String, app: tauri::AppHandle) -> Result<(), String> {
    let (title, body) = match kind.as_str() {
        "offline" => (
            "SmartAIHub Runner",
            "Runner is offline. Reconnect to refresh the device.",
        ),
        "reconnected" => ("SmartAIHub Runner", "Runner is connected again."),
        "projection_unavailable" => (
            "SmartAIHub Companion",
            "Task Control is unavailable until an authenticated desktop projection is connected.",
        ),
        _ => return Err("RUNNER_COMPANION_NOTIFICATION_INVALID".into()),
    };
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|_| "RUNNER_COMPANION_NOTIFICATION_FAILED".into())
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
        token_expiry_ms(&saved.control_token)
            .is_some_and(|expires_at| expires_at <= now_ms.saturating_add(60_000))
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
    Ok(RunnerStatus {
        connected: connection.is_some() && matches!(credential_state, "valid" | "renewed"),
        running: state.running.load(Ordering::Acquire),
        runner_id: state.config.runner_id.clone(),
        default_workspace_id: settings.default_workspace_id.clone(),
        auto_start_enabled: settings.auto_start_enabled,
        last_error: state
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
        .map_err(|error| {
            if error.contains("APPROVAL_TIMEOUT") {
                "RUNNER_CONNECT_APPROVAL_TIMEOUT".into()
            } else if error.contains("APPROVAL_FAILED") || error.contains("expired") {
                "RUNNER_CONNECT_APPROVAL_FAILED".into()
            } else if error.contains("open this URL") {
                "RUNNER_CONNECT_BROWSER_OPEN_FAILED".into()
            } else {
                "RUNNER_CONNECT_FAILED".into()
            }
        });
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
    tauri::async_runtime::spawn_blocking(move || discover_local_tools(&config))
        .await
        .map_err(|_| "RUNNER_TOOL_SCAN_TASK_FAILED".to_string())
}

#[tauri::command]
async fn verify_runner_tool(
    tool_id: String,
    state: State<'_, RunnerState>,
) -> Result<smartaihub_runner::diagnostics::ToolVerificationResult, String> {
    let config = state.config.clone();
    tauri::async_runtime::spawn_blocking(move || verify_local_tool(&config, &tool_id))
        .await
        .map_err(|_| "RUNNER_TOOL_VERIFY_TASK_FAILED".to_string())?
}

/// Publish readiness using the existing authenticated rescan path. This does
/// not enter the control loop, poll commands or execute a task. Serialize with
/// start/stop so a local verification cannot replace a live execution binding.
#[tauri::command]
async fn sync_runner_capabilities(state: State<'_, RunnerState>) -> Result<String, String> {
    let config = state.config.clone();
    let lifecycle = state.lifecycle.clone();
    let running = state.running.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lifecycle
            .lock()
            .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")?;
        if running.load(Ordering::Acquire) {
            return Ok("runtime_running".into());
        }
        if load_connection(&config.data_root)?.is_none() {
            return Ok("disconnected".into());
        }
        let report = connection_status(&config, "rescan")?;
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
    .map_err(|_| "RUNNER_CAPABILITY_SYNC_TASK_FAILED".to_string())?
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
    let running = state.running.load(Ordering::Acquire);
    let runner_id = config.runner_id.clone();
    let last_error = state.last_error.lock().ok().and_then(|value| value.clone());
    let refresh_error = state
        .last_refresh_error
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
    let _lifecycle = state
        .lifecycle
        .lock()
        .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")?;
    if state.running.load(Ordering::Acquire) {
        return Ok(());
    }
    let settings = setting_lock(state)?.clone();
    if let Some(workspace_id) = settings.default_workspace_id {
        workspace_registry::resolve(&state.config, &workspace_id)?;
        std::env::set_var("SAH_RUNNER_DEFAULT_WORKSPACE_ID", workspace_id);
    } else {
        std::env::remove_var("SAH_RUNNER_DEFAULT_WORKSPACE_ID");
    }
    let stop = Arc::new(AtomicBool::new(false));
    *state
        .stop
        .lock()
        .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")? = Some(stop.clone());
    let config = state.config.clone();
    let running = state.running.clone();
    let last_error = state.last_error.clone();
    if let Ok(mut error) = last_error.lock() {
        *error = None;
    }
    state.running.store(true, Ordering::Release);
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
            state.running.store(false, Ordering::Release);
            "RUNNER_THREAD_START_FAILED"
        })?;
    *state
        .worker
        .lock()
        .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")? = Some(handle);
    Ok(())
}

fn stop_runner_inner(state: &RunnerState) -> Result<(), String> {
    let _lifecycle = state
        .lifecycle
        .lock()
        .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")?;
    if let Some(stop) = state
        .stop
        .lock()
        .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")?
        .take()
    {
        stop.store(true, Ordering::Release);
    }
    if let Some(worker) = state
        .worker
        .lock()
        .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")?
        .take()
    {
        worker.join().map_err(|_| "RUNNER_THREAD_JOIN_FAILED")?;
    }
    state.running.store(false, Ordering::Release);
    std::env::remove_var("SAH_RUNNER_DEFAULT_WORKSPACE_ID");
    Ok(())
}

#[tauri::command]
fn start_runner(state: State<'_, RunnerState>) -> Result<(), String> {
    start_runner_inner(&state)
}

#[tauri::command]
fn stop_runner(state: State<'_, RunnerState>) -> Result<(), String> {
    stop_runner_inner(&state)
}

#[tauri::command]
fn list_workspaces(
    state: State<'_, RunnerState>,
) -> Result<Vec<workspace_view::WorkspaceView>, String> {
    workspace_view::list(&state.config)
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
        .lock()
        .map_err(|_| "RUNNER_LIFECYCLE_LOCK_FAILED")?;
    workspace_view::bind(
        &state.config,
        state.running.load(Ordering::Acquire),
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
    if state.running.load(Ordering::Acquire) {
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
    if state.running.load(Ordering::Acquire) {
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
fn quit_runner(app: tauri::AppHandle, state: State<'_, RunnerState>) -> Result<(), String> {
    stop_runner_inner(&state)?;
    app.exit(0);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
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
                stop: Mutex::new(None),
                worker: Mutex::new(None),
                running: Arc::new(AtomicBool::new(false)),
                last_error: Arc::new(Mutex::new(None)),
                lifecycle: Arc::new(Mutex::new(())),
                last_refresh_attempt: Mutex::new(None),
                last_refresh_error: Mutex::new(None),
            });

            let open = MenuItem::with_id(app, "open", "Open Runner settings", true, None::<&str>)?;
            let companion = MenuItem::with_id(
                app,
                "companion",
                "Show Floating Companion",
                true,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "Quit Runner", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&companion, &open, &quit])?;
            let tray_icon = app
                .default_window_icon()
                .cloned()
                .ok_or_else(|| std::io::Error::other("Runner tray icon missing"))?;
            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("SmartAIHub Runner")
                .icon(tray_icon)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "companion" => {
                        if let Some(state) = app.try_state::<RunnerState>() {
                            let _ = show_companion(app.clone(), state);
                        }
                    }
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        if let Some(state) = app.try_state::<RunnerState>() {
                            let _ = stop_runner_inner(&state);
                        }
                        app.exit(0);
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
                            if let Ok(mut last_error) = state.last_error.lock() {
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
            } else if settings.companion_enabled {
                if let Some(window) = app.get_webview_window("companion") {
                    let preferences = app.try_state::<RunnerState>().and_then(|state| {
                        state
                            .settings
                            .lock()
                            .ok()
                            .map(|settings| settings.companion.clone())
                    });
                    if let Some(preferences) = preferences {
                        let _ = apply_companion_preferences(&window, &preferences);
                    }
                    let _ = window.show();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if window.label() == "companion" {
                    let app = window.app_handle();
                    if let (Some(state), Some(companion)) = (
                        app.try_state::<RunnerState>(),
                        app.get_webview_window("companion"),
                    ) {
                        let _ = remember_companion_bounds(&state, &companion);
                    }
                }
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            runner_status,
            companion_projection_status,
            companion_auth_status,
            start_companion_auth,
            poll_companion_auth,
            companion_state,
            logout_companion,
            companion_preferences,
            set_companion_preferences,
            show_companion,
            hide_companion,
            toggle_companion,
            open_runner_settings,
            snap_companion_to_edge,
            set_companion_expanded,
            notify_companion,
            retry_runner_credentials,
            connect_runner,
            rescan_runner,
            sync_runner_capabilities,
            verify_runner_tool,
            export_runner_debug_report,
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
    use super::{refresh_requires_browser_reauthorization, reset_refresh_backoff_for_manual_retry};
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
}

#[cfg(test)]
mod companion_preference_tests {
    use super::{
        companion_height_for_expanded, default_companion_theme, resize_companion_bounds,
        snap_bounds_to_nearest_edge, valid_companion_theme, CompanionBounds, CompanionPreferences,
        PhysicalPosition, PhysicalRect, PhysicalSize,
    };

    #[test]
    fn bounds_are_bounded_and_fit_the_current_monitor_work_area() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(-1920, 0),
            size: PhysicalSize::new(1920, 1080),
        };
        let bounds = CompanionBounds {
            x: 100_000,
            y: -100_000,
            width: 10_000,
            height: 1,
        }
        .fit_work_area(&work_area);

        assert_eq!(bounds.width, 560);
        assert_eq!(bounds.height, 150);
        assert_eq!(bounds.x, -572);
        assert_eq!(bounds.y, 12);
    }

    #[test]
    fn snapping_uses_physical_monitor_edges_and_supports_negative_coordinates() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(-1920, 40),
            size: PhysicalSize::new(1920, 1040),
        };
        let snapped = snap_bounds_to_nearest_edge(
            CompanionBounds {
                x: -1900,
                y: 480,
                width: 380,
                height: 178,
            },
            &work_area,
        );

        assert_eq!(snapped.x, -1908);
        assert_eq!(snapped.y, 480);
        assert_eq!(snapped.width, 380);
        assert_eq!(snapped.height, 178);
    }

    #[test]
    fn preferences_default_to_system_theme_and_reject_unknown_themes() {
        let preferences = CompanionPreferences::default();
        assert_eq!(preferences.theme, default_companion_theme());
        assert!(valid_companion_theme("dark"));
        assert!(!valid_companion_theme("midnight"));
    }

    #[test]
    fn projection_status_is_explicitly_unavailable_without_user_transport() {
        let status = super::companion_projection_status();
        assert_eq!(status.schema_version, "runner-companion.v1");
        assert_eq!(status.availability, "unavailable");
        assert_eq!(status.authentication, "runner_device_only");
        assert_eq!(
            status.reason_code,
            "RUNNER_COMPANION_USER_PROJECTION_AUTH_REQUIRED"
        );
    }

    #[test]
    fn expansion_uses_bounded_heights_and_preserves_monitor_docking() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(1920, 0),
            size: PhysicalSize::new(1280, 720),
        };
        let compact = resize_companion_bounds(
            CompanionBounds {
                x: 2800,
                y: 500,
                width: 380,
                height: 178,
            },
            false,
            &work_area,
        );
        let expanded = resize_companion_bounds(compact.clone(), true, &work_area);
        assert_eq!(companion_height_for_expanded(false), 178);
        assert_eq!(companion_height_for_expanded(true), 420);
        assert_eq!(compact.width, expanded.width);
        assert_eq!(expanded.height, 420);
        assert!(expanded.x >= work_area.position.x);
        assert!(expanded.y >= work_area.position.y);
        assert!(expanded.y + expanded.height as i32 <= 720);
    }
}
