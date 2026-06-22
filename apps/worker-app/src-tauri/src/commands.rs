use crate::executor_state::ExecutorState;
use crate::runtime_manifest::{doctor_from_default_paths, DoctorSummary};
use crate::settings::WorkerAppSettings;
use crate::WorkerAppState;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

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
    state: tauri::State<'_, WorkerAppState>,
    settings: WorkerAppSettings,
) -> Result<WorkerAppSettings, String> {
    settings.validate()?;
    let mut locked = state
        .settings
        .lock()
        .map_err(|_| "settings lock poisoned".to_string())?;
    *locked = settings.clone();
    Ok(settings)
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
    Ok(doctor_from_default_paths(&resource_dir))
}

#[tauri::command]
pub async fn worker_app_start_connect(app: tauri::AppHandle) -> Result<(), String> {
    let url = "https://app.smartaihub.com/workers/connect";
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| format!("unable to open browser approval: {error}"))
}
