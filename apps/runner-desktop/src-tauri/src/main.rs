#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use smartaihub_runner::{
    config::RunnerConfig,
    connection::{connect_local_runner, load_connection, load_or_refresh, token_expiry_ms},
    diagnostics::{discover_local_tools, run_local_entrypoint_desktop, verify_local_tool},
    workspace_registry::{self, LocalWorkspaceDetails},
};
use std::{
    fs,
    path::PathBuf,
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
    stop: Mutex<Option<Arc<AtomicBool>>>,
    worker: Mutex<Option<JoinHandle<()>>>,
    running: Arc<AtomicBool>,
    last_error: Arc<Mutex<Option<String>>>,
    lifecycle: Mutex<()>,
    last_refresh_attempt: Mutex<Option<(Instant, &'static str)>>,
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
    let runner_id = std::env::var("SAH_RUNNER_ID").unwrap_or_else(|_| "local-runner".into());
    let device_id = std::env::var("SAH_RUNNER_DEVICE_ID").unwrap_or_else(|_| "local-device".into());
    let control_url = std::env::var("SAH_RUNNER_CONTROL_URL")
        .unwrap_or_else(|_| format!("https://smartaihub.app/api/runners/{runner_id}/control"));
    let mut config = RunnerConfig::local(&runner_id, &device_id, &control_url);
    config.data_root = data_root.to_string_lossy().into_owned();
    Ok((config, data_root.join("desktop_settings.json")))
}

fn setting_lock(state: &RunnerState) -> Result<std::sync::MutexGuard<'_, DesktopSettings>, String> {
    state
        .settings
        .lock()
        .map_err(|_| "RUNNER_LOCAL_SETTINGS_LOCK_FAILED".into())
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
                    false
                }
                Some((attempted_at, _)) if attempted_at.elapsed() < Duration::from_secs(30) => {
                    credential_state = "retrying";
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
                    if let Ok(mut last_attempt) = state.last_refresh_attempt.lock() {
                        *last_attempt = Some((Instant::now(), "renewed"));
                    }
                }
                Err(error) => {
                    credential_state = if ["_401", "_403", "REVOKED", "runner_revoked"]
                        .iter()
                        .any(|marker| error.contains(marker))
                    {
                        "reauth_required"
                    } else {
                        "retrying"
                    };
                    if let Ok(mut last_attempt) = state.last_refresh_attempt.lock() {
                        *last_attempt = Some((Instant::now(), credential_state));
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
    })
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
fn list_workspaces(state: State<'_, RunnerState>) -> Result<Vec<LocalWorkspaceDetails>, String> {
    workspace_registry::list_local_details(&state.config)
}

#[tauri::command]
fn add_workspace(
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
                lifecycle: Mutex::new(()),
                last_refresh_attempt: Mutex::new(None),
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
            connect_runner,
            rescan_runner,
            verify_runner_tool,
            start_runner,
            stop_runner,
            list_workspaces,
            add_workspace,
            remove_workspace,
            set_default_workspace,
            set_auto_start,
            quit_runner
        ])
        .run(tauri::generate_context!())
        .expect("failed to run SmartAIHub Runner");
}
