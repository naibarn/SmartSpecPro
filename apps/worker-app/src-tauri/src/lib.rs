pub mod commands;
pub mod control_plane;
pub mod credentials;
pub mod executor_state;
pub mod runtime_manifest;
pub mod settings;
pub mod worker_executor;

use std::sync::{Arc, Mutex};

use executor_state::ExecutorState;
use settings::WorkerAppSettings;

#[derive(Debug, Default)]
pub struct WorkerAppState {
    pub settings: Arc<Mutex<WorkerAppSettings>>,
    pub executor: Arc<Mutex<ExecutorState>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(WorkerAppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::worker_app_get_settings,
            commands::worker_app_save_settings,
            commands::worker_app_get_executor_state,
            commands::worker_app_run_doctor,
            commands::worker_app_start_connect,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Smart AI Hub Worker App");
}
