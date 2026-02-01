// Dashboard Commands - Tauri IPC Commands for Progress Dashboard
//
// Provides commands for:
// - Project management
// - Task operations
// - Timeline retrieval
// - Metrics calculation

use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::progress_dashboard::{
    ProgressDashboard, Project, Task, Subtask, TimelineEntry,
    ProjectMetrics, ProjectUpdate, TaskUpdate, Milestone,
};

// ============================================
// State Types
// ============================================

pub struct DashboardState {
    pub dashboard: ProgressDashboard,
}

impl DashboardState {
    pub fn new() -> Self {
        Self {
            dashboard: ProgressDashboard::new(),
        }
    }
}

// ============================================
// Project Commands
// ============================================

#[tauri::command]
pub async fn dashboard_create_project(
    state: State<'_, Arc<Mutex<DashboardState>>>,
    name: String,
    description: Option<String>,
) -> Result<Project, String> {
    let mut state = state.lock().await;
    Ok(state.dashboard.create_project(&name, description.as_deref()))
}

#[tauri::command]
pub async fn dashboard_get_project(
    state: State<'_, Arc<Mutex<DashboardState>>>,
    project_id: String,
) -> Result<Project, String> {
    let state = state.lock().await;
    state.dashboard.get_project(&project_id)
        .cloned()
        .ok_or_else(|| format!("Project not found: {}", project_id))
}

#[tauri::command]
pub async fn dashboard_list_projects(
    state: State<'_, Arc<Mutex<DashboardState>>>,
) -> Result<Vec<Project>, String> {
    let state = state.lock().await;
    Ok(state.dashboard.list_projects().into_iter().cloned().collect())
}

#[tauri::command]
pub async fn dashboard_update_project(
    state: State<'_, Arc<Mutex<DashboardState>>>,
    project_id: String,
    updates: ProjectUpdate,
) -> Result<Project, String> {
    let mut state = state.lock().await;
    state.dashboard.update_project(&project_id, updates)
}

// ============================================
// Task Commands
// ============================================

#[tauri::command]
pub async fn dashboard_create_task(
    state: State<'_, Arc<Mutex<DashboardState>>>,
    project_id: String,
    title: String,
    column_id: String,
) -> Result<Task, String> {
    let mut state = state.lock().await;
    state.dashboard.create_task(&project_id, &title, &column_id)
}

#[tauri::command]
pub async fn dashboard_get_task(
    state: State<'_, Arc<Mutex<DashboardState>>>,
    task_id: String,
) -> Result<Task, String> {
    let state = state.lock().await;
    state.dashboard.get_task(&task_id)
        .cloned()
        .ok_or_else(|| format!("Task not found: {}", task_id))
}

#[tauri::command]
pub async fn dashboard_get_project_tasks(
    state: State<'_, Arc<Mutex<DashboardState>>>,
    project_id: String,
) -> Result<Vec<Task>, String> {
    let state = state.lock().await;
    Ok(state.dashboard.get_project_tasks(&project_id).into_iter().cloned().collect())
}

#[tauri::command]
pub async fn dashboard_get_column_tasks(
    state: State<'_, Arc<Mutex<DashboardState>>>,
    project_id: String,
    column_id: String,
) -> Result<Vec<Task>, String> {
    let state = state.lock().await;
    Ok(state.dashboard.get_column_tasks(&project_id, &column_id).into_iter().cloned().collect())
}

#[tauri::command]
pub async fn dashboard_update_task(
    state: State<'_, Arc<Mutex<DashboardState>>>,
    task_id: String,
    updates: TaskUpdate,
) -> Result<Task, String> {
    let mut state = state.lock().await;
    state.dashboard.update_task(&task_id, updates)
}

#[tauri::command]
pub async fn dashboard_move_task(
    state: State<'_, Arc<Mutex<DashboardState>>>,
    task_id: String,
    column_id: String,
    position: i32,
) -> Result<Task, String> {
    let mut state = state.lock().await;
    state.dashboard.move_task(&task_id, &column_id, position)
}

#[tauri::command]
pub async fn dashboard_delete_task(
    state: State<'_, Arc<Mutex<DashboardState>>>,
    task_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.dashboard.delete_task(&task_id)
}

// ============================================
// Subtask Commands
// ============================================

#[tauri::command]
pub async fn dashboard_add_subtask(
    state: State<'_, Arc<Mutex<DashboardState>>>,
    task_id: String,
    title: String,
) -> Result<Subtask, String> {
    let mut state = state.lock().await;
    state.dashboard.add_subtask(&task_id, &title)
}

#[tauri::command]
pub async fn dashboard_toggle_subtask(
    state: State<'_, Arc<Mutex<DashboardState>>>,
    task_id: String,
    subtask_id: String,
) -> Result<bool, String> {
    let mut state = state.lock().await;
    state.dashboard.toggle_subtask(&task_id, &subtask_id)
}

// ============================================
// Timeline Commands
// ============================================

#[tauri::command]
pub async fn dashboard_get_timeline(
    state: State<'_, Arc<Mutex<DashboardState>>>,
    project_id: String,
    limit: Option<usize>,
) -> Result<Vec<TimelineEntry>, String> {
    let state = state.lock().await;
    Ok(state.dashboard.get_project_timeline(&project_id, limit.unwrap_or(50))
        .into_iter().cloned().collect())
}

// ============================================
// Metrics Commands
// ============================================

#[tauri::command]
pub async fn dashboard_get_metrics(
    state: State<'_, Arc<Mutex<DashboardState>>>,
    project_id: String,
) -> Result<ProjectMetrics, String> {
    let state = state.lock().await;
    Ok(state.dashboard.get_project_metrics(&project_id))
}

#[tauri::command]
pub async fn dashboard_get_board_data(
    state: State<'_, Arc<Mutex<DashboardState>>>,
    project_id: String,
) -> Result<BoardData, String> {
    let state = state.lock().await;
    
    let project = state.dashboard.get_project(&project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;
    
    let mut columns = Vec::new();
    for column in &project.settings.board_columns {
        let tasks = state.dashboard.get_column_tasks(&project_id, &column.id)
            .into_iter().cloned().collect();
        columns.push(BoardColumnData {
            column: column.clone(),
            tasks,
        });
    }
    
    Ok(BoardData {
        project: project.clone(),
        columns,
    })
}

#[derive(serde::Serialize)]
pub struct BoardData {
    pub project: Project,
    pub columns: Vec<BoardColumnData>,
}

#[derive(serde::Serialize)]
pub struct BoardColumnData {
    pub column: crate::progress_dashboard::BoardColumn,
    pub tasks: Vec<Task>,
}
