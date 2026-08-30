pub mod comfy_executor;
pub mod comfy_mcp_client;
pub mod comfy_mcp_runtime;
pub mod comfy_mcp_transport;
pub mod comfy_profiles;
pub mod comfy_execution_ledger;
pub mod comfy_credentials;
pub mod comfy_ssh_tunnel;
pub mod commands;
pub mod control_plane;
pub mod credentials;
pub mod diagnostics;
pub mod executor_state;
pub mod hermes_executor;
pub mod hermes_runtime;
pub mod media_pipeline;
pub mod runtime_manifest;
pub mod series_workspace;
pub mod settings;
pub mod worker_control_plane;
pub mod worker_executor;
pub mod worker_loop;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::collections::HashMap;

use credentials::WorkerDeviceProofMaterial;
use executor_state::ExecutorState;
use settings::{load_settings, WorkerAppSettings};
use tauri::Manager;
use worker_loop::WorkerLoopHandle;

pub struct WorkerAppState {
    pub settings: Arc<Mutex<WorkerAppSettings>>,
    pub executor: Arc<Mutex<ExecutorState>>,
    pub active_connected_device_proof: Arc<Mutex<Option<WorkerDeviceProofMaterial>>>,
    pub pending_connect_device_proof: Arc<Mutex<Option<WorkerDeviceProofMaterial>>>,
    pub worker_loop: Arc<Mutex<Option<WorkerLoopHandle>>>,
    pub shutdown_in_progress: Arc<AtomicBool>,
    pub series_workspace: Arc<Mutex<series_workspace::SeriesWorkspaceState>>,
    pub comfy_interactive_runs: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl Default for WorkerAppState {
    fn default() -> Self {
        Self::new(WorkerAppSettings::default())
    }
}

impl WorkerAppState {
    pub fn new(settings: WorkerAppSettings) -> Self {
        Self {
            settings: Arc::new(Mutex::new(settings)),
            executor: Arc::new(Mutex::new(ExecutorState::default())),
            active_connected_device_proof: Arc::new(Mutex::new(None)),
            pending_connect_device_proof: Arc::new(Mutex::new(None)),
            worker_loop: Arc::new(Mutex::new(None)),
            shutdown_in_progress: Arc::new(AtomicBool::new(false)),
            series_workspace: Arc::new(Mutex::new(
                series_workspace::SeriesWorkspaceState::default(),
            )),
            comfy_interactive_runs: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // MUST be registered first (plugin contract). Without it, Windows
        // sign-in autostart could start a second copy on top of a
        // tray-resident one — two processes sharing one `connection.json`,
        // each rotating the other's single-use refresh token, which the server
        // answers with `401 Worker token has been revoked`.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            if let Ok(dir) = app.path().app_data_dir() {
                diagnostics::log_warn(
                    &dir,
                    "app.second_instance_blocked",
                    serde_json::json!({ "args": args, "cwd": cwd }),
                );
            }
            // Surface the window that is already running rather than starting
            // a rival worker.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        // Native OS dialogs — these surface even when the app window is not
        // focused (or is minimised to the background loop), which is the whole
        // point: a dead connection must interrupt the user, not wait quietly
        // inside a window nobody is looking at.
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().ok();
            let settings = data_dir.as_deref().map(load_settings).unwrap_or_default();
            // The first line of every run. Answers, without asking the user to
            // reproduce anything: did the app start at all, was it started by
            // Windows sign-in (the Run key is set) or by hand, from which
            // executable, and is another copy already running — this build has
            // no single-instance guard, so two copies can share one connection
            // file and rotate each other's single-use refresh token.
            if let Some(dir) = data_dir.as_deref() {
                diagnostics::append_diagnostic_event(
                    dir,
                    "app.start",
                    serde_json::json!({
                        "executable": std::env::current_exe()
                            .map(|path| path.to_string_lossy().to_string())
                            .unwrap_or_else(|_| "unknown".into()),
                        "loginAutostartRegistered": commands::query_login_startup_enabled(),
                        "startWithWindowsSetting": settings.start_with_windows,
                        "acceptJobs": settings.accept_jobs,
                        "serverUrl": settings.server_url,
                        "appDataDir": dir.to_string_lossy(),
                        "args": std::env::args().skip(1).collect::<Vec<_>>(),
                    }),
                );
            }
            let state = WorkerAppState::new(settings);
            if let Some(dir) = data_dir.as_deref() {
                if let Ok(Some(root)) = series_workspace::load_root_state(dir) {
                    if let Ok(mut workspace) = state.series_workspace.lock() {
                        let projection =
                            series_workspace::redacted_projection(&root, None, "recovered");
                        workspace.root = Some(root);
                        workspace.projection = Some(projection);
                    }
                }
            }
            app.manage(state);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle().clone();
                let state = app.state::<WorkerAppState>();
                if state.shutdown_in_progress.swap(true, Ordering::Relaxed) {
                    return;
                }
                api.prevent_close();
                tauri::async_runtime::spawn(async move {
                    // Pairs with `app.start`. A run that ends here shut down
                    // cleanly; a run with no `app.exit` was killed, and a
                    // rotation in flight at that moment is exactly how a
                    // machine ends up holding a refresh token the server has
                    // already spent.
                    if let Ok(dir) = app.path().app_data_dir() {
                        diagnostics::append_diagnostic_event(
                            &dir,
                            "app.exit",
                            serde_json::json!({ "trigger": "window_close_requested" }),
                        );
                    }
                    let state = app.state::<WorkerAppState>();
                    let _ = commands::stop_worker_loop_state(&state).await;
                    app.exit(0);
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::worker_app_get_settings,
            commands::worker_app_get_comfy_profiles,
            commands::worker_app_save_comfy_profile,
            commands::worker_app_activate_comfy_profile,
            commands::worker_app_disable_comfy_profile,
            commands::worker_app_set_comfy_credential,
            commands::worker_app_delete_comfy_credential,
            commands::worker_app_probe_comfy_profile,
            commands::worker_app_inspect_comfy_workflow,
            commands::worker_app_run_comfy_workflow,
            commands::worker_app_cancel_comfy_workflow,
            commands::worker_app_upload_comfy_file,
            commands::worker_app_get_comfy_mcp_runtime,
            commands::worker_app_install_comfy_mcp,
            commands::worker_app_save_settings,
            commands::worker_app_set_render_update_blocked,
            commands::worker_app_get_saved_connection,
            commands::worker_app_check_connection_health,
            commands::worker_app_get_startup_status,
            commands::worker_app_open_hermes_tui,
            commands::worker_app_hermes_auth_summary,
            commands::worker_app_hermes_signin_xai,
            commands::worker_app_clear_saved_connection,
            commands::worker_app_get_executor_state,
            commands::worker_app_get_worker_job_summary,
            commands::worker_app_get_worker_policy,
            commands::worker_app_run_doctor,
            commands::worker_app_run_full_doctor,
            commands::worker_app_check_runtime_update,
            commands::worker_app_open_wsl_dependency_repair,
            commands::worker_app_open_managed_wsl_runtime_setup,
            commands::worker_app_get_managed_wsl_runtime_setup_status,
            commands::worker_app_install_runtime_pack,
            commands::worker_app_clear_runtime_pack,
            commands::worker_app_install_hermes_runtime,
            commands::worker_app_hermes_doctor,
            commands::worker_app_start_connect,
            commands::worker_app_start_connect_session,
            commands::worker_app_poll_connect_session,
            commands::worker_app_refresh_saved_connection,
            commands::worker_app_start_worker_loop,
            commands::worker_app_start_saved_worker_loop,
            commands::worker_app_stop_worker_loop,
            commands::worker_app_get_worker_loop_status,
            commands::worker_app_configure_startup,
            commands::worker_app_get_diagnostics_log,
            commands::worker_app_open_file,
            commands::worker_app_install_update,
            commands::worker_app_open_url,
            commands::worker_app_run_manual_command,
            commands::worker_app_pick_local_root,
            commands::worker_app_select_series_workspace,
            commands::worker_app_create_series_folder,
            commands::worker_app_validate_local_root,
            commands::worker_app_scan_preview,
            commands::worker_app_import_local_files,
            commands::worker_app_analyze_media_asset,
            commands::worker_app_get_local_workspace_status,
            commands::worker_app_revoke_local_root,
            commands::worker_app_list_series,
            commands::worker_app_execute_series_quick_action,
            commands::worker_app_get_series_media_workspace,
            commands::worker_app_get_series_queue,
            commands::worker_app_bind_series,
            commands::worker_app_build_media_plan,
            commands::worker_app_process_media_asset,
            commands::worker_app_submit_media_job,
            commands::worker_app_submit_media_ingest_job,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Smart AI Hub Worker App");
}
