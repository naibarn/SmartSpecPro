pub mod commands;
pub mod control_plane;
pub mod credentials;
pub mod diagnostics;
pub mod executor_state;
pub mod hermes_executor;
pub mod hermes_runtime;
pub mod runtime_manifest;
pub mod settings;
pub mod worker_control_plane;
pub mod worker_executor;
pub mod worker_loop;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

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
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let settings = app
                .path()
                .app_data_dir()
                .map(|dir| load_settings(&dir))
                .unwrap_or_default();
            app.manage(WorkerAppState::new(settings));
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
                    let state = app.state::<WorkerAppState>();
                    let _ = commands::stop_worker_loop_state(&state).await;
                    app.exit(0);
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::worker_app_get_settings,
            commands::worker_app_save_settings,
            commands::worker_app_get_saved_connection,
            commands::worker_app_clear_saved_connection,
            commands::worker_app_get_executor_state,
            commands::worker_app_run_doctor,
            commands::worker_app_run_full_doctor,
            commands::worker_app_open_wsl_dependency_repair,
            commands::worker_app_open_managed_wsl_runtime_setup,
            commands::worker_app_install_runtime_pack,
            commands::worker_app_clear_runtime_pack,
            commands::worker_app_install_hermes_runtime,
            commands::worker_app_hermes_doctor,
            commands::worker_app_start_connect,
            commands::worker_app_start_connect_session,
            commands::worker_app_poll_connect_session,
            commands::worker_app_refresh_connect_tokens,
            commands::worker_app_refresh_saved_connection,
            commands::worker_app_start_worker_loop,
            commands::worker_app_start_saved_worker_loop,
            commands::worker_app_stop_worker_loop,
            commands::worker_app_get_worker_loop_status,
            commands::worker_app_configure_startup,
            commands::worker_app_open_file,
            commands::worker_app_run_manual_command,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Smart AI Hub Worker App");
}
