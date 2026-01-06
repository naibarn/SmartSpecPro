mod python_bridge;
mod database;
mod models;
mod repository;
mod git_manager;
mod secure_store;

use python_bridge::{OutputMessage, PythonBridge, WorkflowArgs};
use tokio::sync::Mutex;
use tauri::{Manager, State};
use std::sync::Arc;

use database::Database;
use models::*;
use repository::*;
use git_manager::GitManager;

// App state
struct AppState {
    python_bridge: Mutex<PythonBridge>,
    db: Arc<Database>,
    git_manager: Arc<Mutex<Option<GitManager>>>,
}

// Tauri commands

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn run_workflow(
    state: State<'_, AppState>,
    workflow_id: String,
    workflow_name: String,
    args: WorkflowArgs,
) -> Result<(), String> {
    let bridge = state.python_bridge.lock().await;

    bridge
        .spawn_workflow(workflow_id, workflow_name, args)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_workflow_output(
    state: State<'_, AppState>,
    workflow_id: String,
) -> Result<Option<OutputMessage>, String> {
    let bridge = state.python_bridge.lock().await;

    bridge.get_output(&workflow_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_workflow(state: State<'_, AppState>, workflow_id: String) -> Result<(), String> {
    let bridge = state.python_bridge.lock().await;

    bridge.stop_workflow(&workflow_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_workflow_status(state: State<'_, AppState>, workflow_id: String) -> Result<String, String> {
    let bridge = state.python_bridge.lock().await;

    bridge.get_status(&workflow_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_workflows(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let bridge = state.python_bridge.lock().await;

    bridge.list_workflows().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn validate_spec(
    state: State<'_, AppState>,
    spec_path: String,
) -> Result<serde_json::Value, String> {
    let bridge = state.python_bridge.lock().await;

    bridge.validate_spec(spec_path).await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Find Python bridge script in resources
            let resource_path = app.path().resource_dir()
                .expect("Failed to get resource dir");
            let bridge_path = resource_path
                .join("python")
                .join("bridge.py");
            
            // Initialize Python bridge with resource path
            let python_bridge = PythonBridge::with_path(bridge_path)
                .expect("Failed to initialize Python bridge");
            
            // Use app data directory for database
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to get app data dir");
            
            // Create app data directory if it doesn't exist
            std::fs::create_dir_all(&app_data_dir)
                .expect("Failed to create app data directory");
            
            let db_path = app_data_dir.join("smartspecpro.db");
            let db = Database::new(db_path).expect("Failed to initialize database");
            
            // Store state
            app.manage(AppState {
                python_bridge: Mutex::new(python_bridge),
                db: Arc::new(db),
                git_manager: Arc::new(Mutex::new(None)),
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            run_workflow,
            get_workflow_output,
            stop_workflow,
            get_workflow_status,
            list_workflows,
            validate_spec,
            // Workflow Management
            create_workflow_db,
            get_workflow_db,
            get_workflow_by_name_db,
            list_workflows_db,
            update_workflow_db,
            delete_workflow_db,
            // Execution Management
            create_execution_db,
            get_execution_db,
            list_executions_db,
            update_execution_status_db,
            delete_execution_db,
            delete_old_executions_db,
            // Config Management
            upsert_config_db,
            get_config_db,
            list_configs_by_workflow_db,
            delete_config_db,
            // Database Stats
            get_database_stats,
            get_database_version,
            // Git Commands
            git_init,
            git_create_branch,
            git_checkout_branch,
            git_create_and_checkout_branch,
            git_get_current_branch,
            git_commit_all,
            git_push_branch,
            git_has_changes,
            git_list_branches,
            secure_store::set_proxy_token,
            secure_store::get_proxy_token,
            secure_store::delete_proxy_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ========================================
// Workflow Management Commands
// ========================================

#[tauri::command]
async fn create_workflow_db(
    state: State<'_, AppState>,
    req: CreateWorkflowRequest,
) -> Result<Workflow, String> {
    let workflow = Workflow::new(req.name, req.description, req.config);
    let repo = WorkflowRepository::new(state.db.get_connection());
    
    repo.create(&workflow).map_err(|e| e.to_string())?;
    
    Ok(workflow)
}

#[tauri::command]
async fn get_workflow_db(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<Workflow>, String> {
    let repo = WorkflowRepository::new(state.db.get_connection());
    repo.get_by_id(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_workflow_by_name_db(
    state: State<'_, AppState>,
    name: String,
) -> Result<Option<Workflow>, String> {
    let repo = WorkflowRepository::new(state.db.get_connection());
    repo.get_by_name(&name).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_workflows_db(
    state: State<'_, AppState>,
    filter: WorkflowFilter,
) -> Result<Vec<Workflow>, String> {
    let repo = WorkflowRepository::new(state.db.get_connection());
    repo.list(&filter).map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_workflow_db(
    state: State<'_, AppState>,
    id: String,
    req: UpdateWorkflowRequest,
) -> Result<(), String> {
    let repo = WorkflowRepository::new(state.db.get_connection());
    repo.update(&id, &req).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_workflow_db(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let repo = WorkflowRepository::new(state.db.get_connection());
    repo.delete(&id).map_err(|e| e.to_string())
}

// ========================================
// Execution Management Commands
// ========================================

#[tauri::command]
async fn create_execution_db(
    state: State<'_, AppState>,
    workflow_id: String,
    workflow_name: String,
) -> Result<Execution, String> {
    let execution = Execution::new(workflow_id, workflow_name);
    let repo = ExecutionRepository::new(state.db.get_connection());
    
    repo.create(&execution).map_err(|e| e.to_string())?;
    
    Ok(execution)
}

#[tauri::command]
async fn get_execution_db(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<Execution>, String> {
    let repo = ExecutionRepository::new(state.db.get_connection());
    repo.get_by_id(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_executions_db(
    state: State<'_, AppState>,
    filter: ExecutionFilter,
) -> Result<Vec<Execution>, String> {
    let repo = ExecutionRepository::new(state.db.get_connection());
    repo.list(&filter).map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_execution_status_db(
    state: State<'_, AppState>,
    id: String,
    status: String,
    output: Option<serde_json::Value>,
    error: Option<String>,
) -> Result<(), String> {
    let status_enum = ExecutionStatus::from_str(&status)
        .ok_or_else(|| format!("Invalid status: {}", status))?;
    
    let repo = ExecutionRepository::new(state.db.get_connection());
    repo.update_status(&id, status_enum, output, error).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_execution_db(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let repo = ExecutionRepository::new(state.db.get_connection());
    repo.delete(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_old_executions_db(
    state: State<'_, AppState>,
    days: i64,
) -> Result<usize, String> {
    let repo = ExecutionRepository::new(state.db.get_connection());
    repo.delete_old(days).map_err(|e| e.to_string())
}

// ========================================
// Config Management Commands
// ========================================

#[tauri::command]
async fn upsert_config_db(
    state: State<'_, AppState>,
    workflow_id: String,
    key: String,
    value: String,
    value_type: String,
    description: Option<String>,
) -> Result<Config, String> {
    let value_type_enum = ConfigValueType::from_str(&value_type)
        .ok_or_else(|| format!("Invalid value type: {}", value_type))?;
    
    let config = Config::new(workflow_id, key, value, value_type_enum, description);
    let repo = ConfigRepository::new(state.db.get_connection());
    
    repo.upsert(&config).map_err(|e| e.to_string())?;
    
    Ok(config)
}

#[tauri::command]
async fn get_config_db(
    state: State<'_, AppState>,
    workflow_id: String,
    key: String,
) -> Result<Option<Config>, String> {
    let repo = ConfigRepository::new(state.db.get_connection());
    repo.get(&workflow_id, &key).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_configs_by_workflow_db(
    state: State<'_, AppState>,
    workflow_id: String,
) -> Result<Vec<Config>, String> {
    let repo = ConfigRepository::new(state.db.get_connection());
    repo.list_by_workflow(&workflow_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_config_db(
    state: State<'_, AppState>,
    workflow_id: String,
    key: String,
) -> Result<(), String> {
    let repo = ConfigRepository::new(state.db.get_connection());
    repo.delete(&workflow_id, &key).map_err(|e| e.to_string())
}

// ========================================
// Database Stats Commands
// ========================================

#[tauri::command]
async fn get_database_stats(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let stats = state.db.get_stats().map_err(|e| e.to_string())?;
    
    Ok(serde_json::json!({
        "workflow_count": stats.workflow_count,
        "execution_count": stats.execution_count,
        "config_count": stats.config_count,
    }))
}

#[tauri::command]
async fn get_database_version(
    state: State<'_, AppState>,
) -> Result<String, String> {
    state.db.get_version().map_err(|e| e.to_string())
}

// ========================================
// Git Commands
// ========================================

#[tauri::command]
async fn git_init(
    state: State<'_, AppState>,
    repo_path: String,
) -> Result<(), String> {
    let manager = GitManager::new(repo_path);
    
    if !manager.repo_exists() {
        return Err("Repository not found at path".to_string());
    }
    
    let mut git_manager = state.git_manager.lock().await;
    *git_manager = Some(manager);
    
    Ok(())
}

#[tauri::command]
async fn git_create_branch(
    state: State<'_, AppState>,
    branch_name: String,
) -> Result<(), String> {
    let git_manager = state.git_manager.lock().await;
    
    if let Some(manager) = git_manager.as_ref() {
        manager.create_branch(&branch_name).map_err(|e| e.to_string())
    } else {
        Err("Git manager not initialized".to_string())
    }
}

#[tauri::command]
async fn git_checkout_branch(
    state: State<'_, AppState>,
    branch_name: String,
) -> Result<(), String> {
    let git_manager = state.git_manager.lock().await;
    
    if let Some(manager) = git_manager.as_ref() {
        manager.checkout_branch(&branch_name).map_err(|e| e.to_string())
    } else {
        Err("Git manager not initialized".to_string())
    }
}

#[tauri::command]
async fn git_create_and_checkout_branch(
    state: State<'_, AppState>,
    branch_name: String,
) -> Result<(), String> {
    let git_manager = state.git_manager.lock().await;
    
    if let Some(manager) = git_manager.as_ref() {
        manager.create_and_checkout_branch(&branch_name).map_err(|e| e.to_string())
    } else {
        Err("Git manager not initialized".to_string())
    }
}

#[tauri::command]
async fn git_get_current_branch(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let git_manager = state.git_manager.lock().await;
    
    if let Some(manager) = git_manager.as_ref() {
        manager.get_current_branch().map_err(|e| e.to_string())
    } else {
        Err("Git manager not initialized".to_string())
    }
}

#[tauri::command]
async fn git_commit_all(
    state: State<'_, AppState>,
    message: String,
) -> Result<String, String> {
    let git_manager = state.git_manager.lock().await;
    
    if let Some(manager) = git_manager.as_ref() {
        manager.stage_all().map_err(|e| e.to_string())?;
        manager.commit(&message).map_err(|e| e.to_string())
    } else {
        Err("Git manager not initialized".to_string())
    }
}

#[tauri::command]
async fn git_push_branch(
    state: State<'_, AppState>,
    branch_name: String,
    remote_name: String,
) -> Result<(), String> {
    let git_manager = state.git_manager.lock().await;
    
    if let Some(manager) = git_manager.as_ref() {
        manager.push_branch(&branch_name, &remote_name).map_err(|e| e.to_string())
    } else {
        Err("Git manager not initialized".to_string())
    }
}

#[tauri::command]
async fn git_has_changes(
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let git_manager = state.git_manager.lock().await;
    
    if let Some(manager) = git_manager.as_ref() {
        manager.has_changes().map_err(|e| e.to_string())
    } else {
        Err("Git manager not initialized".to_string())
    }
}

#[tauri::command]
async fn git_list_branches(
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let git_manager = state.git_manager.lock().await;
    
    if let Some(manager) = git_manager.as_ref() {
        manager.list_branches().map_err(|e| e.to_string())
    } else {
        Err("Git manager not initialized".to_string())
    }
}