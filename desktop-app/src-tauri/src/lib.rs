// ========================================
// Module Declarations
// ========================================

// Core modules
mod python_bridge;
mod database;
mod models;
mod repository;

// Git & Workspace
mod git_manager;
mod git_workflow;
mod workspace_manager;
mod workspace_db;
mod workspace_data;
mod workspace_commands;

// Security modules
mod secure_store;
mod api_key_service;
mod keyring_fallback;
mod input_validation;
mod rate_limiter;
mod template_sanitizer;
mod error_handling;
mod sql_builder;

// Docker
mod docker_manager;

// LLM & Chat
mod llm_service;
mod memory_manager;
mod context_builder;
mod chat_commands;

// CLI
mod cli_service;
mod cli_commands;

// Jobs
mod job_manager;
mod job_commands;

// Performance & Monitoring
mod performance;
mod performance_commands;
mod memory_monitor;
mod cost_persistence;
mod platform_tests;

// Phase 2: Non-Dev Friendly
mod template_engine;
mod template_commands;
mod spec_builder;
mod spec_commands;
mod progress_dashboard;
mod dashboard_commands;
mod collaboration;
mod collab_commands;

// Phase 3: Advanced Features
mod plugin_system;
mod plugin_commands;
mod marketplace;
mod marketplace_commands;
mod ai_enhancement;
mod ai_commands;
mod multi_workspace;
mod multiworkspace_commands;
mod enterprise;
mod enterprise_commands;
mod workflow_commands;

// ========================================
// Imports
// ========================================

use python_bridge::{OutputMessage, PythonBridge, WorkflowArgs};
use workflow_commands::WorkflowState;
use tokio::sync::Mutex;
use tauri::{Manager, State};
use std::sync::Arc;

use database::Database;
use models::*;
use repository::*;
use git_manager::GitManager;
use docker_manager::{DockerManager, ContainerInfo, ContainerStats, ImageInfo, DockerInfo, ContainerLogs, SandboxConfig};
use workspace_commands::AppState as WorkspaceAppState;

// ========================================
// App State
// ========================================

struct AppState {
    python_bridge: Mutex<PythonBridge>,
    db: Arc<Database>,
    git_manager: Arc<Mutex<Option<GitManager>>>,
}

// ========================================
// Core Tauri Commands
// ========================================

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

// ========================================
// Main Entry Point
// ========================================

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
            
            // Initialize workspace state
            let workspace_state = WorkspaceAppState::new()
                .expect("Failed to initialize workspace state");
            
            // Store states
            app.manage(AppState {
                python_bridge: Mutex::new(python_bridge),
                db: Arc::new(db),
                git_manager: Arc::new(Mutex::new(None)),
            });
            
            app.manage(workspace_state);
            
            // Initialize workflow state for Chat-to-Workflow Bridge
            app.manage(Arc::new(Mutex::new(WorkflowState::new())));
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // ========================================
            // Core Commands
            // ========================================
            greet,
            run_workflow,
            get_workflow_output,
            stop_workflow,
            get_workflow_status,
            list_workflows,
            validate_spec,
            
            // ========================================
            // Chat-to-Workflow Bridge Commands
            // ========================================
            workflow_commands::workflow_detect_intent,
            workflow_commands::workflow_execute,
            workflow_commands::workflow_stop,
            workflow_commands::workflow_list_running,
            workflow_commands::workflow_approve,
            workflow_commands::workflow_reject,
            
            // ========================================
            // Workflow Management
            // ========================================
            create_workflow_db,
            get_workflow_db,
            get_workflow_by_name_db,
            list_workflows_db,
            update_workflow_db,
            delete_workflow_db,
            
            // ========================================
            // Execution Management
            // ========================================
            create_execution_db,
            get_execution_db,
            list_executions_db,
            update_execution_status_db,
            delete_execution_db,
            delete_old_executions_db,
            
            // ========================================
            // Config Management
            // ========================================
            upsert_config_db,
            get_config_db,
            list_configs_by_workflow_db,
            delete_config_db,
            
            // ========================================
            // Database Stats
            // ========================================
            get_database_stats,
            get_database_version,
            
            // ========================================
            // Git Commands
            // ========================================
            git_init,
            git_create_branch,
            git_checkout_branch,
            git_create_and_checkout_branch,
            git_get_current_branch,
            git_commit_all,
            git_push_branch,
            git_has_changes,
            git_list_branches,
            
            // ========================================
            // Secure Store
            // ========================================
            secure_store::set_proxy_token,
            secure_store::get_proxy_token,
            secure_store::delete_proxy_token,
            
            // ========================================
            // Docker Management
            // ========================================
            docker_check,
            docker_list_containers,
            docker_get_container_stats,
            docker_get_container_logs,
            docker_start_container,
            docker_stop_container,
            docker_restart_container,
            docker_remove_container,
            docker_list_images,
            docker_pull_image,
            docker_remove_image,
            docker_create_sandbox,
            docker_exec_command,
            docker_prune_containers,
            docker_prune_images,
            
            // ========================================
            // Workspace Management
            // ========================================
            workspace_commands::create_workspace,
            workspace_commands::list_workspaces,
            workspace_commands::get_workspace,
            workspace_commands::get_recent_workspaces,
            workspace_commands::update_workspace,
            workspace_commands::delete_workspace,
            workspace_commands::open_workspace,
            workspace_commands::close_workspace,
            workspace_commands::get_workspace_stats,
            
            // ========================================
            // Workspace Maintenance
            // ========================================
            workspace_commands::backup_workspace,
            workspace_commands::restore_workspace,
            workspace_commands::vacuum_workspace,
            workspace_commands::cleanup_expired_memory,
            workspace_commands::optimize_workspace,
            
            // ========================================
            // App Settings
            // ========================================
            workspace_commands::get_app_setting,
            workspace_commands::set_app_setting,
            
            // ========================================
            // Jobs
            // ========================================
            workspace_commands::create_job,
            workspace_commands::get_job,
            workspace_commands::list_jobs,
            workspace_commands::update_job_status,
            workspace_commands::delete_job,
            
            // ========================================
            // Tasks
            // ========================================
            workspace_commands::create_task,
            workspace_commands::list_tasks,
            workspace_commands::update_task_status,
            
            // ========================================
            // Chat Sessions
            // ========================================
            workspace_commands::create_chat_session,
            workspace_commands::list_chat_sessions,
            workspace_commands::add_chat_message,
            workspace_commands::get_chat_messages,
            
            // ========================================
            // Knowledge
            // ========================================
            workspace_commands::create_knowledge,
            workspace_commands::search_knowledge,
            workspace_commands::list_knowledge,
            
            // ========================================
            // Memory
            // ========================================
            workspace_commands::create_memory_long,
            workspace_commands::get_relevant_memories,
            workspace_commands::increment_memory_access,
            
            // ========================================
            // Chat Commands (Phase 1.2)
            // ========================================
            chat_commands::chat_create_session,
            chat_commands::chat_send_message,
            chat_commands::chat_get_history,
            chat_commands::chat_list_sessions,
            chat_commands::chat_delete_session,
            chat_commands::chat_get_context,
            chat_commands::chat_add_to_knowledge,
            chat_commands::chat_search_knowledge,
            chat_commands::chat_get_memory_stats,
            chat_commands::chat_clear_short_term_memory,
            chat_commands::chat_pin_to_working_memory,
            chat_commands::chat_get_available_models,
            chat_commands::chat_set_model,
            chat_commands::chat_get_current_model,
            chat_commands::chat_estimate_tokens,
            chat_commands::chat_get_usage_stats,
            
            // ========================================
            // CLI Commands (Phase 1.3)
            // ========================================
            cli_commands::cli_execute,
            cli_commands::cli_get_history,
            cli_commands::cli_clear_history,
            cli_commands::cli_get_suggestions,
            cli_commands::cli_list_files,
            cli_commands::cli_read_file,
            cli_commands::cli_write_file,
            cli_commands::cli_delete_file,
            cli_commands::cli_get_diff,
            cli_commands::cli_apply_diff,
            cli_commands::cli_search_files,
            cli_commands::cli_get_file_tree,
            
            // ========================================
            // Job Commands (Phase 1.4)
            // ========================================
            job_commands::job_create,
            job_commands::job_get,
            job_commands::job_list,
            job_commands::job_update_status,
            job_commands::job_delete,
            job_commands::job_add_task,
            job_commands::job_update_task,
            job_commands::job_get_tasks,
            job_commands::job_create_branch,
            job_commands::job_get_branches,
            job_commands::job_merge_branch,
            job_commands::job_get_stats,
            
            // ========================================
            // Performance Commands (Phase 1.5)
            // ========================================
            performance_commands::perf_get_metrics,
            performance_commands::perf_get_cache_stats,
            performance_commands::perf_clear_cache,
            performance_commands::perf_optimize,
            performance_commands::perf_get_recommendations,
            
            // ========================================
            // Template Commands (Phase 2.1)
            // ========================================
            template_commands::template_list,
            template_commands::template_get,
            template_commands::template_create_project,
            template_commands::template_validate,
            template_commands::template_get_categories,
            
            // ========================================
            // Spec Builder Commands (Phase 2.2)
            // ========================================
            spec_commands::spec_create,
            spec_commands::spec_get,
            spec_commands::spec_update,
            spec_commands::spec_delete,
            spec_commands::spec_add_component,
            spec_commands::spec_remove_component,
            spec_commands::spec_connect_components,
            spec_commands::spec_export,
            spec_commands::spec_import,
            spec_commands::spec_get_component_library,
            
            // ========================================
            // Dashboard Commands (Phase 2.3)
            // ========================================
            dashboard_commands::dashboard_get_overview,
            dashboard_commands::dashboard_get_metrics,
            dashboard_commands::dashboard_get_timeline,
            dashboard_commands::dashboard_get_burndown,
            dashboard_commands::dashboard_export_report,
            
            // ========================================
            // Collaboration Commands (Phase 2.4)
            // ========================================
            collab_commands::collab_add_comment,
            collab_commands::collab_get_comments,
            collab_commands::collab_add_reaction,
            collab_commands::collab_request_review,
            collab_commands::collab_submit_review,
            collab_commands::collab_get_notifications,
            collab_commands::collab_mark_notification_read,
            collab_commands::collab_get_activity_feed,
            
            // ========================================
            // Plugin Commands (Phase 3.1)
            // ========================================
            plugin_commands::plugin_list,
            plugin_commands::plugin_install,
            plugin_commands::plugin_uninstall,
            plugin_commands::plugin_enable,
            plugin_commands::plugin_disable,
            plugin_commands::plugin_get_config,
            plugin_commands::plugin_set_config,
            
            // ========================================
            // Marketplace Commands (Phase 3.2)
            // ========================================
            marketplace_commands::marketplace_search,
            marketplace_commands::marketplace_get_item,
            marketplace_commands::marketplace_install,
            marketplace_commands::marketplace_get_categories,
            marketplace_commands::marketplace_get_featured,
            
            // ========================================
            // AI Commands (Phase 3.3)
            // ========================================
            ai_commands::ai_get_suggestions,
            ai_commands::ai_analyze_code,
            ai_commands::ai_predict_bugs,
            ai_commands::ai_generate_docs,
            ai_commands::ai_get_quality_report,
            
            // ========================================
            // Multi-workspace Commands (Phase 3.4)
            // ========================================
            multiworkspace_commands::mw_list_workspaces,
            multiworkspace_commands::mw_switch_workspace,
            multiworkspace_commands::mw_sync_workspace,
            multiworkspace_commands::mw_create_team_workspace,
            multiworkspace_commands::mw_share_workspace,
            
            // ========================================
            // Enterprise Commands (Phase 3.5)
            // ========================================
            enterprise_commands::ent_configure_sso,
            enterprise_commands::ent_get_sso_config,
            enterprise_commands::ent_create_role,
            enterprise_commands::ent_assign_role,
            enterprise_commands::ent_get_permissions,
            enterprise_commands::ent_get_audit_logs,
            enterprise_commands::ent_export_audit_logs,
            enterprise_commands::ent_get_compliance_report,
            
            // ========================================
            // Security Commands
            // ========================================
            api_key_service::api_key_set,
            api_key_service::api_key_get,
            api_key_service::api_key_delete,
            api_key_service::api_key_list_providers,
            api_key_service::api_key_validate,
            
            // ========================================
            // Rate Limiter Commands
            // ========================================
            rate_limiter::rate_limit_check,
            rate_limiter::rate_limit_get_status,
            rate_limiter::rate_limit_reset,
            
            // ========================================
            // Input Validation Commands
            // ========================================
            input_validation::validate_path,
            input_validation::validate_command,
            input_validation::validate_input,
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
    config_snapshot: Option<serde_json::Value>,
) -> Result<Execution, String> {
    let execution = Execution::new(workflow_id, config_snapshot);
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
    let repo = ExecutionRepository::new(state.db.get_connection());
    repo.update_status(&id, &status, output, error).map_err(|e| e.to_string())
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
    repo.delete_older_than(days).map_err(|e| e.to_string())
}

// ========================================
// Config Management Commands
// ========================================

#[tauri::command]
async fn upsert_config_db(
    state: State<'_, AppState>,
    workflow_id: String,
    key: String,
    value: serde_json::Value,
) -> Result<Config, String> {
    let config = Config::new(workflow_id, key, value);
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
    let workflow_repo = WorkflowRepository::new(state.db.get_connection());
    let execution_repo = ExecutionRepository::new(state.db.get_connection());
    
    let workflow_count = workflow_repo.count().map_err(|e| e.to_string())?;
    let execution_count = execution_repo.count().map_err(|e| e.to_string())?;
    
    Ok(serde_json::json!({
        "workflows": workflow_count,
        "executions": execution_count,
        "database_size": state.db.get_size().map_err(|e| e.to_string())?,
    }))
}

#[tauri::command]
async fn get_database_version(
    state: State<'_, AppState>,
) -> Result<i32, String> {
    state.db.get_version().map_err(|e| e.to_string())
}

// ========================================
// Git Commands
// ========================================

#[tauri::command]
async fn git_init(
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    let manager = GitManager::init(&path).map_err(|e| e.to_string())?;
    let mut git = state.git_manager.lock().await;
    *git = Some(manager);
    Ok(())
}

#[tauri::command]
async fn git_create_branch(
    state: State<'_, AppState>,
    branch_name: String,
) -> Result<(), String> {
    let git = state.git_manager.lock().await;
    let manager = git.as_ref().ok_or("Git not initialized")?;
    manager.create_branch(&branch_name).map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_checkout_branch(
    state: State<'_, AppState>,
    branch_name: String,
) -> Result<(), String> {
    let git = state.git_manager.lock().await;
    let manager = git.as_ref().ok_or("Git not initialized")?;
    manager.checkout_branch(&branch_name).map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_create_and_checkout_branch(
    state: State<'_, AppState>,
    branch_name: String,
) -> Result<(), String> {
    let git = state.git_manager.lock().await;
    let manager = git.as_ref().ok_or("Git not initialized")?;
    manager.create_and_checkout_branch(&branch_name).map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_get_current_branch(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let git = state.git_manager.lock().await;
    let manager = git.as_ref().ok_or("Git not initialized")?;
    manager.get_current_branch().map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_commit_all(
    state: State<'_, AppState>,
    message: String,
) -> Result<String, String> {
    let git = state.git_manager.lock().await;
    let manager = git.as_ref().ok_or("Git not initialized")?;
    manager.commit_all(&message).map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_push_branch(
    state: State<'_, AppState>,
    branch_name: String,
    remote: Option<String>,
) -> Result<(), String> {
    let git = state.git_manager.lock().await;
    let manager = git.as_ref().ok_or("Git not initialized")?;
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    manager.push_branch(&branch_name, &remote_name).map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_has_changes(
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let git = state.git_manager.lock().await;
    let manager = git.as_ref().ok_or("Git not initialized")?;
    manager.has_changes().map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_list_branches(
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let git = state.git_manager.lock().await;
    let manager = git.as_ref().ok_or("Git not initialized")?;
    manager.list_branches().map_err(|e| e.to_string())
}

// ========================================
// Docker Commands
// ========================================

#[tauri::command]
async fn docker_check() -> Result<DockerInfo, String> {
    DockerManager::check().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn docker_list_containers(all: bool) -> Result<Vec<ContainerInfo>, String> {
    DockerManager::list_containers(all).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn docker_get_container_stats(container_id: String) -> Result<ContainerStats, String> {
    DockerManager::get_container_stats(&container_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn docker_get_container_logs(container_id: String, tail: Option<u32>) -> Result<ContainerLogs, String> {
    DockerManager::get_container_logs(&container_id, tail).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn docker_start_container(container_id: String) -> Result<(), String> {
    DockerManager::start_container(&container_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn docker_stop_container(container_id: String) -> Result<(), String> {
    DockerManager::stop_container(&container_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn docker_restart_container(container_id: String) -> Result<(), String> {
    DockerManager::restart_container(&container_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn docker_remove_container(container_id: String, force: bool) -> Result<(), String> {
    DockerManager::remove_container(&container_id, force).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn docker_list_images() -> Result<Vec<ImageInfo>, String> {
    DockerManager::list_images().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn docker_pull_image(image: String) -> Result<(), String> {
    DockerManager::pull_image(&image).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn docker_remove_image(image_id: String, force: bool) -> Result<(), String> {
    DockerManager::remove_image(&image_id, force).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn docker_create_sandbox(config: SandboxConfig) -> Result<String, String> {
    DockerManager::create_sandbox(config).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn docker_exec_command(container_id: String, command: Vec<String>) -> Result<String, String> {
    DockerManager::exec_command(&container_id, command).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn docker_prune_containers() -> Result<u64, String> {
    DockerManager::prune_containers().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn docker_prune_images() -> Result<u64, String> {
    DockerManager::prune_images().await.map_err(|e| e.to_string())
}
