pub mod commands;
pub mod control_plane;
pub mod credentials;
pub mod executor_state;
pub mod runtime_manifest;
pub mod settings;
pub mod worker_control_plane;
pub mod worker_executor;
pub mod worker_loop;

use std::sync::{Arc, Mutex};

use executor_state::ExecutorState;
use settings::{load_settings, WorkerAppSettings};
use tauri::Manager;
use worker_loop::WorkerLoopHandle;

pub struct WorkerAppState {
    pub settings: Arc<Mutex<WorkerAppSettings>>,
    pub executor: Arc<Mutex<ExecutorState>>,
    pub worker_loop: Arc<Mutex<Option<WorkerLoopHandle>>>,
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
            worker_loop: Arc::new(Mutex::new(None)),
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
        .invoke_handler(tauri::generate_handler![
            commands::worker_app_get_settings,
            commands::worker_app_save_settings,
            commands::worker_app_get_saved_connection,
            commands::worker_app_clear_saved_connection,
            commands::worker_app_get_executor_state,
            commands::worker_app_run_doctor,
            commands::worker_app_install_runtime_pack,
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
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Smart AI Hub Worker App");
}
