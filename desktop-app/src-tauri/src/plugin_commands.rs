// Plugin Commands - Tauri IPC Commands for Plugin System
//
// Provides commands for:
// - Plugin installation and management
// - Plugin settings
// - Hook and event handling
// - Permission management

use tauri::State;
use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::Mutex;
use std::path::PathBuf;

use crate::plugin_system::{
    PluginManager, Plugin, PluginManifest, PluginState, Permission,
    PluginApi, PluginContext, get_plugin_template,
};

// ============================================
// State Types
// ============================================

pub struct PluginSystemState {
    pub manager: PluginManager,
}

impl PluginSystemState {
    pub fn new(plugins_dir: PathBuf) -> Self {
        Self {
            manager: PluginManager::new(plugins_dir),
        }
    }
}

// ============================================
// Plugin Management Commands
// ============================================

#[tauri::command]
pub async fn plugin_install(
    state: State<'_, Arc<Mutex<PluginSystemState>>>,
    manifest: PluginManifest,
    wasm_path: String,
) -> Result<Plugin, String> {
    let mut state = state.lock().await;
    state.manager.install_plugin(manifest, &wasm_path)
}

#[tauri::command]
pub async fn plugin_uninstall(
    state: State<'_, Arc<Mutex<PluginSystemState>>>,
    plugin_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.manager.uninstall_plugin(&plugin_id)
}

#[tauri::command]
pub async fn plugin_enable(
    state: State<'_, Arc<Mutex<PluginSystemState>>>,
    plugin_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.manager.enable_plugin(&plugin_id)
}

#[tauri::command]
pub async fn plugin_disable(
    state: State<'_, Arc<Mutex<PluginSystemState>>>,
    plugin_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.manager.disable_plugin(&plugin_id)
}

#[tauri::command]
pub async fn plugin_get(
    state: State<'_, Arc<Mutex<PluginSystemState>>>,
    plugin_id: String,
) -> Result<Plugin, String> {
    let state = state.lock().await;
    state.manager.get_plugin(&plugin_id)
        .cloned()
        .ok_or_else(|| format!("Plugin not found: {}", plugin_id))
}

#[tauri::command]
pub async fn plugin_list(
    state: State<'_, Arc<Mutex<PluginSystemState>>>,
) -> Result<Vec<Plugin>, String> {
    let state = state.lock().await;
    Ok(state.manager.list_plugins().into_iter().cloned().collect())
}

#[tauri::command]
pub async fn plugin_list_enabled(
    state: State<'_, Arc<Mutex<PluginSystemState>>>,
) -> Result<Vec<Plugin>, String> {
    let state = state.lock().await;
    Ok(state.manager.list_enabled_plugins().into_iter().cloned().collect())
}

// ============================================
// Plugin Settings Commands
// ============================================

#[tauri::command]
pub async fn plugin_get_settings(
    state: State<'_, Arc<Mutex<PluginSystemState>>>,
    plugin_id: String,
) -> Result<HashMap<String, serde_json::Value>, String> {
    let state = state.lock().await;
    state.manager.get_plugin_settings(&plugin_id)
}

#[tauri::command]
pub async fn plugin_update_settings(
    state: State<'_, Arc<Mutex<PluginSystemState>>>,
    plugin_id: String,
    settings: HashMap<String, serde_json::Value>,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.manager.update_plugin_settings(&plugin_id, settings)
}

// ============================================
// Hook Commands
// ============================================

#[tauri::command]
pub async fn plugin_get_hook_handlers(
    state: State<'_, Arc<Mutex<PluginSystemState>>>,
    hook_name: String,
) -> Result<Vec<HookHandlerInfo>, String> {
    let state = state.lock().await;
    let handlers = state.manager.get_hook_handlers(&hook_name);
    Ok(handlers.into_iter().map(|h| HookHandlerInfo {
        plugin_id: h.plugin_id.clone(),
        handler: h.handler.clone(),
        priority: h.priority,
    }).collect())
}

#[derive(serde::Serialize)]
pub struct HookHandlerInfo {
    pub plugin_id: String,
    pub handler: String,
    pub priority: i32,
}

// ============================================
// Event Commands
// ============================================

#[tauri::command]
pub async fn plugin_subscribe(
    state: State<'_, Arc<Mutex<PluginSystemState>>>,
    plugin_id: String,
    event_type: String,
    handler: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.manager.subscribe(&plugin_id, &event_type, &handler);
    Ok(())
}

#[tauri::command]
pub async fn plugin_unsubscribe(
    state: State<'_, Arc<Mutex<PluginSystemState>>>,
    plugin_id: String,
    event_type: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.manager.unsubscribe(&plugin_id, &event_type);
    Ok(())
}

// ============================================
// Permission Commands
// ============================================

#[tauri::command]
pub async fn plugin_check_permission(
    state: State<'_, Arc<Mutex<PluginSystemState>>>,
    plugin_id: String,
    permission: String,
) -> Result<bool, String> {
    let state = state.lock().await;
    let permission = parse_permission(&permission)?;
    Ok(state.manager.check_permission(&plugin_id, &permission))
}

#[tauri::command]
pub async fn plugin_request_permission(
    state: State<'_, Arc<Mutex<PluginSystemState>>>,
    plugin_id: String,
    permission: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    let permission = parse_permission(&permission)?;
    state.manager.request_permission(&plugin_id, permission)
}

fn parse_permission(s: &str) -> Result<Permission, String> {
    match s.to_lowercase().as_str() {
        "read_files" => Ok(Permission::ReadFiles),
        "write_files" => Ok(Permission::WriteFiles),
        "network_access" => Ok(Permission::NetworkAccess),
        "read_workspace" => Ok(Permission::ReadWorkspace),
        "write_workspace" => Ok(Permission::WriteWorkspace),
        "create_ui" => Ok(Permission::CreateUi),
        "modify_ui" => Ok(Permission::ModifyUi),
        "system_info" => Ok(Permission::SystemInfo),
        "notifications" => Ok(Permission::Notifications),
        "read_settings" => Ok(Permission::ReadSettings),
        "write_settings" => Ok(Permission::WriteSettings),
        "read_database" => Ok(Permission::ReadDatabase),
        "write_database" => Ok(Permission::WriteDatabase),
        _ => Err(format!("Invalid permission: {}", s)),
    }
}

// ============================================
// API Commands
// ============================================

#[tauri::command]
pub async fn plugin_get_api() -> Result<PluginApi, String> {
    Ok(PluginApi::new())
}

#[tauri::command]
pub async fn plugin_get_context(
    state: State<'_, Arc<Mutex<PluginSystemState>>>,
    plugin_id: String,
    workspace_id: Option<String>,
) -> Result<PluginContext, String> {
    let state = state.lock().await;
    let settings = state.manager.get_plugin_settings(&plugin_id)?;
    Ok(PluginContext {
        plugin_id,
        workspace_id,
        settings,
    })
}

#[tauri::command]
pub async fn plugin_get_template() -> Result<String, String> {
    Ok(get_plugin_template())
}
