// Workspace Commands - Tauri IPC Commands for Workspace Database
//
// Exposes workspace database operations to the frontend

use std::sync::Arc;
use tauri::State;

use crate::workspace_db::{WorkspaceDbManager, WorkspaceMetadata, WorkspaceDbStats};
use crate::workspace_data::{
    WorkspaceDataOps, Job, Task, ChatSession, ChatMessage, Knowledge, MemoryLong,
    CreateJobRequest, CreateTaskRequest, CreateChatSessionRequest, CreateChatMessageRequest,
    CreateKnowledgeRequest, CreateMemoryLongRequest,
};

// ============================================
// State Types
// ============================================

pub struct AppState {
    pub db_manager: Arc<WorkspaceDbManager>,
    pub data_ops: Arc<WorkspaceDataOps>,
}

impl AppState {
    pub fn new() -> Result<Self, String> {
        let db_manager = Arc::new(
            WorkspaceDbManager::new()
                .map_err(|e| format!("Failed to initialize database manager: {}", e))?
        );
        
        let data_ops = Arc::new(WorkspaceDataOps::new(Arc::clone(&db_manager)));
        
        Ok(Self { db_manager, data_ops })
    }
}

// ============================================
// Workspace Management Commands
// ============================================

#[tauri::command]
pub async fn create_workspace(
    state: State<'_, AppState>,
    name: String,
    git_remote: Option<String>,
) -> Result<WorkspaceMetadata, String> {
    state.db_manager
        .create_workspace(&name, git_remote.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_workspaces(
    state: State<'_, AppState>,
) -> Result<Vec<WorkspaceMetadata>, String> {
    state.db_manager
        .list_workspaces()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceMetadata, String> {
    state.db_manager
        .get_workspace(&workspace_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_recent_workspaces(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<WorkspaceMetadata>, String> {
    state.db_manager
        .get_recent_workspaces(limit.unwrap_or(10))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
    name: Option<String>,
    git_remote: Option<String>,
) -> Result<(), String> {
    state.db_manager
        .update_workspace(&workspace_id, name.as_deref(), git_remote.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), String> {
    state.db_manager
        .delete_workspace(&workspace_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceMetadata, String> {
    // Open the workspace database connection
    state.db_manager
        .open_workspace(&workspace_id)
        .map_err(|e| e.to_string())?;
    
    // Return workspace metadata
    state.db_manager
        .get_workspace(&workspace_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn close_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), String> {
    state.db_manager
        .close_workspace(&workspace_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_workspace_stats(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceDbStats, String> {
    state.db_manager
        .get_workspace_stats(&workspace_id)
        .map_err(|e| e.to_string())
}

// ============================================
// Workspace Maintenance Commands
// ============================================

#[tauri::command]
pub async fn backup_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
    backup_path: String,
) -> Result<(), String> {
    let path = std::path::PathBuf::from(backup_path);
    state.db_manager
        .backup_workspace(&workspace_id, &path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
    backup_path: String,
) -> Result<(), String> {
    let path = std::path::PathBuf::from(backup_path);
    state.db_manager
        .restore_workspace(&workspace_id, &path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn vacuum_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), String> {
    state.db_manager
        .vacuum_workspace(&workspace_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cleanup_expired_memory(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<usize, String> {
    state.db_manager
        .cleanup_expired_memory(&workspace_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn optimize_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), String> {
    state.db_manager
        .optimize_workspace(&workspace_id)
        .map_err(|e| e.to_string())
}

// ============================================
// App Settings Commands
// ============================================

#[tauri::command]
pub async fn get_app_setting(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<String>, String> {
    state.db_manager
        .get_app_setting(&key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_app_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    state.db_manager
        .set_app_setting(&key, &value)
        .map_err(|e| e.to_string())
}

// ============================================
// Job Commands
// ============================================

#[tauri::command]
pub async fn create_job(
    state: State<'_, AppState>,
    workspace_id: String,
    name: String,
    description: Option<String>,
    branch_name: Option<String>,
    parent_job_id: Option<String>,
) -> Result<Job, String> {
    let request = CreateJobRequest {
        name,
        description,
        branch_name,
        parent_job_id,
    };
    
    state.data_ops
        .create_job(&workspace_id, request)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_job(
    state: State<'_, AppState>,
    workspace_id: String,
    job_id: String,
) -> Result<Job, String> {
    state.data_ops
        .get_job(&workspace_id, &job_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_jobs(
    state: State<'_, AppState>,
    workspace_id: String,
    status: Option<String>,
) -> Result<Vec<Job>, String> {
    state.data_ops
        .list_jobs(&workspace_id, status.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_job_status(
    state: State<'_, AppState>,
    workspace_id: String,
    job_id: String,
    status: String,
) -> Result<(), String> {
    state.data_ops
        .update_job_status(&workspace_id, &job_id, &status)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_job(
    state: State<'_, AppState>,
    workspace_id: String,
    job_id: String,
) -> Result<(), String> {
    state.data_ops
        .delete_job(&workspace_id, &job_id)
        .map_err(|e| e.to_string())
}

// ============================================
// Task Commands
// ============================================

#[tauri::command]
pub async fn create_task(
    state: State<'_, AppState>,
    workspace_id: String,
    job_id: String,
    title: String,
    description: Option<String>,
    priority: Option<i32>,
    estimated_minutes: Option<i32>,
    assignee: Option<String>,
) -> Result<Task, String> {
    let request = CreateTaskRequest {
        job_id,
        title,
        description,
        priority,
        estimated_minutes,
        assignee,
    };
    
    state.data_ops
        .create_task(&workspace_id, request)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_tasks(
    state: State<'_, AppState>,
    workspace_id: String,
    job_id: String,
) -> Result<Vec<Task>, String> {
    state.data_ops
        .list_tasks(&workspace_id, &job_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_task_status(
    state: State<'_, AppState>,
    workspace_id: String,
    task_id: String,
    status: String,
) -> Result<(), String> {
    state.data_ops
        .update_task_status(&workspace_id, &task_id, &status)
        .map_err(|e| e.to_string())
}

// ============================================
// Chat Session Commands
// ============================================

#[tauri::command]
pub async fn create_chat_session(
    state: State<'_, AppState>,
    workspace_id: String,
    job_id: Option<String>,
    title: Option<String>,
    session_type: Option<String>,
    model_id: Option<String>,
) -> Result<ChatSession, String> {
    let request = CreateChatSessionRequest {
        job_id,
        title,
        session_type,
        model_id,
    };
    
    state.data_ops
        .create_chat_session(&workspace_id, request)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_chat_sessions(
    state: State<'_, AppState>,
    workspace_id: String,
    job_id: Option<String>,
) -> Result<Vec<ChatSession>, String> {
    state.data_ops
        .list_chat_sessions(&workspace_id, job_id.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_chat_message(
    state: State<'_, AppState>,
    workspace_id: String,
    session_id: String,
    role: String,
    content: String,
    tool_calls_json: Option<String>,
    tool_results_json: Option<String>,
    model_id: Option<String>,
    tokens_input: Option<i32>,
    tokens_output: Option<i32>,
    latency_ms: Option<i32>,
) -> Result<ChatMessage, String> {
    let request = CreateChatMessageRequest {
        session_id,
        role,
        content,
        tool_calls_json,
        tool_results_json,
        model_id,
        tokens_input,
        tokens_output,
        latency_ms,
    };
    
    state.data_ops
        .add_chat_message(&workspace_id, request)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_chat_messages(
    state: State<'_, AppState>,
    workspace_id: String,
    session_id: String,
    limit: Option<i32>,
) -> Result<Vec<ChatMessage>, String> {
    state.data_ops
        .get_chat_messages(&workspace_id, &session_id, limit)
        .map_err(|e| e.to_string())
}

// ============================================
// Knowledge Commands
// ============================================

#[tauri::command]
pub async fn create_knowledge(
    state: State<'_, AppState>,
    workspace_id: String,
    knowledge_type: String,
    title: String,
    content: String,
    tags: Option<Vec<String>>,
    file_refs: Option<Vec<String>>,
    source: Option<String>,
    created_by: Option<String>,
) -> Result<Knowledge, String> {
    let request = CreateKnowledgeRequest {
        knowledge_type,
        title,
        content,
        tags,
        file_refs,
        source,
        created_by,
    };
    
    state.data_ops
        .create_knowledge(&workspace_id, request)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_knowledge(
    state: State<'_, AppState>,
    workspace_id: String,
    query: String,
    limit: Option<i32>,
) -> Result<Vec<Knowledge>, String> {
    state.data_ops
        .search_knowledge(&workspace_id, &query, limit)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_knowledge(
    state: State<'_, AppState>,
    workspace_id: String,
    knowledge_type: Option<String>,
) -> Result<Vec<Knowledge>, String> {
    state.data_ops
        .list_knowledge(&workspace_id, knowledge_type.as_deref())
        .map_err(|e| e.to_string())
}

// ============================================
// Memory Commands
// ============================================

#[tauri::command]
pub async fn create_memory_long(
    state: State<'_, AppState>,
    workspace_id: String,
    category: String,
    title: String,
    content: String,
    source: Option<String>,
    confidence: Option<f64>,
) -> Result<MemoryLong, String> {
    let request = CreateMemoryLongRequest {
        category,
        title,
        content,
        source,
        confidence,
    };
    
    state.data_ops
        .create_memory_long(&workspace_id, request)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_relevant_memories(
    state: State<'_, AppState>,
    workspace_id: String,
    category: Option<String>,
    limit: Option<i32>,
) -> Result<Vec<MemoryLong>, String> {
    state.data_ops
        .get_relevant_memories(&workspace_id, category.as_deref(), limit)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn increment_memory_access(
    state: State<'_, AppState>,
    workspace_id: String,
    memory_id: i64,
) -> Result<(), String> {
    state.data_ops
        .increment_memory_access(&workspace_id, memory_id)
        .map_err(|e| e.to_string())
}

// ============================================
// Command Registration Helper
// ============================================

/// Get all workspace-related commands for registration
pub fn get_workspace_commands() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool {
    tauri::generate_handler![
        // Workspace management
        create_workspace,
        list_workspaces,
        get_workspace,
        get_recent_workspaces,
        update_workspace,
        delete_workspace,
        open_workspace,
        close_workspace,
        get_workspace_stats,
        // Workspace maintenance
        backup_workspace,
        restore_workspace,
        vacuum_workspace,
        cleanup_expired_memory,
        optimize_workspace,
        // App settings
        get_app_setting,
        set_app_setting,
        // Jobs
        create_job,
        get_job,
        list_jobs,
        update_job_status,
        delete_job,
        // Tasks
        create_task,
        list_tasks,
        update_task_status,
        // Chat sessions
        create_chat_session,
        list_chat_sessions,
        add_chat_message,
        get_chat_messages,
        // Knowledge
        create_knowledge,
        search_knowledge,
        list_knowledge,
        // Memory
        create_memory_long,
        get_relevant_memories,
        increment_memory_access,
    ]
}
