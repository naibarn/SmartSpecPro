// Job Commands - Tauri IPC Commands for Job & Branch Management
//
// Provides commands for:
// - Job CRUD operations
// - Task management
// - Branch operations
// - Statistics

use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::job_manager::{
    JobManager, Job, Task, Branch, JobStats, JobStatus, TaskStatus,
    CreateJobRequest, UpdateJobRequest, CreateTaskRequest,
};

// ============================================
// State Types
// ============================================

pub struct JobState {
    pub manager: Arc<JobManager>,
}

impl JobState {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(JobManager::new()),
        }
    }
}

// ============================================
// Job Commands
// ============================================

#[tauri::command]
pub async fn job_create(
    state: State<'_, Arc<Mutex<JobState>>>,
    workspace_id: String,
    request: CreateJobRequest,
) -> Result<Job, String> {
    let state = state.lock().await;
    state.manager.create_job(&workspace_id, request).await
}

#[tauri::command]
pub async fn job_get(
    state: State<'_, Arc<Mutex<JobState>>>,
    job_id: String,
) -> Result<Option<Job>, String> {
    let state = state.lock().await;
    Ok(state.manager.get_job(&job_id).await)
}

#[tauri::command]
pub async fn job_update(
    state: State<'_, Arc<Mutex<JobState>>>,
    job_id: String,
    request: UpdateJobRequest,
) -> Result<Job, String> {
    let state = state.lock().await;
    state.manager.update_job(&job_id, request).await
}

#[tauri::command]
pub async fn job_delete(
    state: State<'_, Arc<Mutex<JobState>>>,
    job_id: String,
) -> Result<(), String> {
    let state = state.lock().await;
    state.manager.delete_job(&job_id).await
}

#[tauri::command]
pub async fn job_list(
    state: State<'_, Arc<Mutex<JobState>>>,
    workspace_id: String,
    status: Option<JobStatus>,
) -> Result<Vec<Job>, String> {
    let state = state.lock().await;
    Ok(state.manager.list_jobs(&workspace_id, status).await)
}

// ============================================
// Job Status Commands
// ============================================

#[tauri::command]
pub async fn job_start(
    state: State<'_, Arc<Mutex<JobState>>>,
    job_id: String,
) -> Result<Job, String> {
    let state = state.lock().await;
    state.manager.start_job(&job_id).await
}

#[tauri::command]
pub async fn job_pause(
    state: State<'_, Arc<Mutex<JobState>>>,
    job_id: String,
) -> Result<Job, String> {
    let state = state.lock().await;
    state.manager.pause_job(&job_id).await
}

#[tauri::command]
pub async fn job_complete(
    state: State<'_, Arc<Mutex<JobState>>>,
    job_id: String,
) -> Result<Job, String> {
    let state = state.lock().await;
    state.manager.complete_job(&job_id).await
}

#[tauri::command]
pub async fn job_cancel(
    state: State<'_, Arc<Mutex<JobState>>>,
    job_id: String,
) -> Result<Job, String> {
    let state = state.lock().await;
    state.manager.cancel_job(&job_id).await
}

// ============================================
// Task Commands
// ============================================

#[tauri::command]
pub async fn task_add(
    state: State<'_, Arc<Mutex<JobState>>>,
    job_id: String,
    request: CreateTaskRequest,
) -> Result<Task, String> {
    let state = state.lock().await;
    state.manager.add_task(&job_id, request).await
}

#[tauri::command]
pub async fn task_update_status(
    state: State<'_, Arc<Mutex<JobState>>>,
    job_id: String,
    task_id: String,
    status: TaskStatus,
) -> Result<Task, String> {
    let state = state.lock().await;
    state.manager.update_task_status(&job_id, &task_id, status).await
}

#[tauri::command]
pub async fn task_reorder(
    state: State<'_, Arc<Mutex<JobState>>>,
    job_id: String,
    task_ids: Vec<String>,
) -> Result<(), String> {
    let state = state.lock().await;
    state.manager.reorder_tasks(&job_id, task_ids).await
}

#[tauri::command]
pub async fn task_delete(
    state: State<'_, Arc<Mutex<JobState>>>,
    job_id: String,
    task_id: String,
) -> Result<(), String> {
    let state = state.lock().await;
    state.manager.delete_task(&job_id, &task_id).await
}

// ============================================
// Branch Commands
// ============================================

#[tauri::command]
pub async fn branch_list(
    state: State<'_, Arc<Mutex<JobState>>>,
) -> Result<Vec<Branch>, String> {
    let state = state.lock().await;
    state.manager.get_branches().await
}

#[tauri::command]
pub async fn branch_create(
    state: State<'_, Arc<Mutex<JobState>>>,
    job_id: String,
    branch_name: String,
) -> Result<Branch, String> {
    let state = state.lock().await;
    state.manager.create_branch(&job_id, &branch_name).await
}

#[tauri::command]
pub async fn branch_checkout(
    state: State<'_, Arc<Mutex<JobState>>>,
    branch_name: String,
) -> Result<(), String> {
    let state = state.lock().await;
    state.manager.checkout_branch(&branch_name).await
}

#[tauri::command]
pub async fn branch_merge(
    state: State<'_, Arc<Mutex<JobState>>>,
    source: String,
    target: String,
) -> Result<(), String> {
    let state = state.lock().await;
    state.manager.merge_branch(&source, &target).await
}

#[tauri::command]
pub async fn branch_delete(
    state: State<'_, Arc<Mutex<JobState>>>,
    branch_name: String,
) -> Result<(), String> {
    let state = state.lock().await;
    state.manager.delete_branch(&branch_name).await
}

// ============================================
// Statistics Commands
// ============================================

#[tauri::command]
pub async fn job_stats(
    state: State<'_, Arc<Mutex<JobState>>>,
    workspace_id: String,
) -> Result<JobStats, String> {
    let state = state.lock().await;
    Ok(state.manager.get_stats(&workspace_id).await)
}
