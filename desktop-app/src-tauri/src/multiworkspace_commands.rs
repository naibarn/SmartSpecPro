// Multi-workspace Commands - Tauri IPC Commands for Multi-workspace
//
// Provides commands for:
// - Workspace CRUD
// - Workspace switching
// - Member management
// - Sync operations

use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::multi_workspace::{
    MultiWorkspaceService, Workspace, WorkspaceType, WorkspaceRole,
    WorkspaceMember, WorkspaceSettings, WorkspaceTemplate, RecentWorkspace,
    SyncStatus,
};

// ============================================
// State Types
// ============================================

pub struct MultiWorkspaceState {
    pub service: MultiWorkspaceService,
}

impl MultiWorkspaceState {
    pub fn new() -> Self {
        Self {
            service: MultiWorkspaceService::new(),
        }
    }
}

// ============================================
// Workspace CRUD Commands
// ============================================

#[tauri::command]
pub async fn mw_create_workspace(
    state: State<'_, Arc<Mutex<MultiWorkspaceState>>>,
    name: String,
    workspace_type: String,
    owner_id: String,
    template_id: Option<String>,
) -> Result<Workspace, String> {
    let mut state = state.lock().await;
    let ws_type = parse_workspace_type(&workspace_type)?;
    state.service.create_workspace(&name, ws_type, &owner_id, template_id.as_deref())
}

#[tauri::command]
pub async fn mw_get_workspace(
    state: State<'_, Arc<Mutex<MultiWorkspaceState>>>,
    workspace_id: String,
) -> Result<Workspace, String> {
    let state = state.lock().await;
    state.service.get_workspace(&workspace_id)
        .cloned()
        .ok_or_else(|| format!("Workspace not found: {}", workspace_id))
}

#[tauri::command]
pub async fn mw_list_workspaces(
    state: State<'_, Arc<Mutex<MultiWorkspaceState>>>,
) -> Result<Vec<Workspace>, String> {
    let state = state.lock().await;
    Ok(state.service.list_workspaces().into_iter().cloned().collect())
}

#[tauri::command]
pub async fn mw_update_workspace(
    state: State<'_, Arc<Mutex<MultiWorkspaceState>>>,
    workspace_id: String,
    name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    color: Option<String>,
) -> Result<Workspace, String> {
    let mut state = state.lock().await;
    state.service.update_workspace(
        &workspace_id,
        name.as_deref(),
        description.as_deref(),
        icon.as_deref(),
        color.as_deref(),
    )
}

#[tauri::command]
pub async fn mw_delete_workspace(
    state: State<'_, Arc<Mutex<MultiWorkspaceState>>>,
    workspace_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.delete_workspace(&workspace_id)
}

// ============================================
// Workspace Switching Commands
// ============================================

#[tauri::command]
pub async fn mw_switch_workspace(
    state: State<'_, Arc<Mutex<MultiWorkspaceState>>>,
    workspace_id: String,
) -> Result<Workspace, String> {
    let mut state = state.lock().await;
    state.service.switch_workspace(&workspace_id).cloned()
}

#[tauri::command]
pub async fn mw_get_active_workspace(
    state: State<'_, Arc<Mutex<MultiWorkspaceState>>>,
) -> Result<Option<Workspace>, String> {
    let state = state.lock().await;
    Ok(state.service.get_active_workspace().cloned())
}

#[tauri::command]
pub async fn mw_get_recent_workspaces(
    state: State<'_, Arc<Mutex<MultiWorkspaceState>>>,
    limit: Option<usize>,
) -> Result<Vec<RecentWorkspace>, String> {
    let state = state.lock().await;
    Ok(state.service.get_recent_workspaces(limit.unwrap_or(10))
        .into_iter().cloned().collect())
}

// ============================================
// Member Commands
// ============================================

#[tauri::command]
pub async fn mw_add_member(
    state: State<'_, Arc<Mutex<MultiWorkspaceState>>>,
    workspace_id: String,
    user_id: String,
    name: String,
    email: String,
    role: String,
) -> Result<WorkspaceMember, String> {
    let mut state = state.lock().await;
    let ws_role = parse_workspace_role(&role)?;
    state.service.add_member(&workspace_id, &user_id, &name, &email, ws_role)
}

#[tauri::command]
pub async fn mw_remove_member(
    state: State<'_, Arc<Mutex<MultiWorkspaceState>>>,
    workspace_id: String,
    user_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.remove_member(&workspace_id, &user_id)
}

#[tauri::command]
pub async fn mw_update_member_role(
    state: State<'_, Arc<Mutex<MultiWorkspaceState>>>,
    workspace_id: String,
    user_id: String,
    role: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    let ws_role = parse_workspace_role(&role)?;
    state.service.update_member_role(&workspace_id, &user_id, ws_role)
}

// ============================================
// Sync Commands
// ============================================

#[tauri::command]
pub async fn mw_enable_sync(
    state: State<'_, Arc<Mutex<MultiWorkspaceState>>>,
    workspace_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.enable_sync(&workspace_id)
}

#[tauri::command]
pub async fn mw_disable_sync(
    state: State<'_, Arc<Mutex<MultiWorkspaceState>>>,
    workspace_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.disable_sync(&workspace_id)
}

#[tauri::command]
pub async fn mw_trigger_sync(
    state: State<'_, Arc<Mutex<MultiWorkspaceState>>>,
    workspace_id: String,
) -> Result<SyncStatus, String> {
    let mut state = state.lock().await;
    state.service.trigger_sync(&workspace_id)
}

// ============================================
// Template Commands
// ============================================

#[tauri::command]
pub async fn mw_list_templates(
    state: State<'_, Arc<Mutex<MultiWorkspaceState>>>,
) -> Result<Vec<WorkspaceTemplate>, String> {
    let state = state.lock().await;
    Ok(state.service.list_templates().into_iter().cloned().collect())
}

#[tauri::command]
pub async fn mw_get_template(
    state: State<'_, Arc<Mutex<MultiWorkspaceState>>>,
    template_id: String,
) -> Result<WorkspaceTemplate, String> {
    let state = state.lock().await;
    state.service.get_template(&template_id)
        .cloned()
        .ok_or_else(|| format!("Template not found: {}", template_id))
}

// ============================================
// Settings Commands
// ============================================

#[tauri::command]
pub async fn mw_update_workspace_settings(
    state: State<'_, Arc<Mutex<MultiWorkspaceState>>>,
    workspace_id: String,
    settings: WorkspaceSettings,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.update_workspace_settings(&workspace_id, settings)
}

// ============================================
// Helper Functions
// ============================================

fn parse_workspace_type(s: &str) -> Result<WorkspaceType, String> {
    match s.to_lowercase().as_str() {
        "personal" => Ok(WorkspaceType::Personal),
        "team" => Ok(WorkspaceType::Team),
        "organization" => Ok(WorkspaceType::Organization),
        "shared" => Ok(WorkspaceType::Shared),
        _ => Err(format!("Invalid workspace type: {}", s)),
    }
}

fn parse_workspace_role(s: &str) -> Result<WorkspaceRole, String> {
    match s.to_lowercase().as_str() {
        "owner" => Ok(WorkspaceRole::Owner),
        "admin" => Ok(WorkspaceRole::Admin),
        "editor" => Ok(WorkspaceRole::Editor),
        "viewer" => Ok(WorkspaceRole::Viewer),
        _ => Err(format!("Invalid workspace role: {}", s)),
    }
}
