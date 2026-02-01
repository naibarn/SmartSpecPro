// Plugin System - Extensible Plugin Architecture
//
// Provides:
// - Plugin registry and lifecycle management
// - WASM sandbox execution
// - Plugin API and hooks
// - Permission system

use std::collections::HashMap;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ============================================
// Plugin Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plugin {
    pub id: String,
    pub manifest: PluginManifest,
    pub state: PluginState,
    pub settings: HashMap<String, serde_json::Value>,
    pub permissions: Vec<Permission>,
    pub installed_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub homepage: Option<String>,
    pub repository: Option<String>,
    pub license: Option<String>,
    pub icon: Option<String>,
    pub category: PluginCategory,
    pub tags: Vec<String>,
    pub min_app_version: String,
    pub entry_point: String,
    pub permissions: Vec<Permission>,
    pub settings_schema: Option<SettingsSchema>,
    pub hooks: Vec<HookRegistration>,
    pub commands: Vec<CommandRegistration>,
    pub ui_contributions: Vec<UiContribution>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginCategory {
    Templates,
    Integrations,
    Ai,
    Ui,
    Analytics,
    Export,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginState {
    Installed,
    Enabled,
    Disabled,
    Error { message: String },
    Updating,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Permission {
    // File system
    ReadFiles,
    WriteFiles,
    
    // Network
    NetworkAccess,
    
    // Workspace
    ReadWorkspace,
    WriteWorkspace,
    
    // UI
    CreateUi,
    ModifyUi,
    
    // System
    SystemInfo,
    Notifications,
    
    // Data
    ReadSettings,
    WriteSettings,
    ReadDatabase,
    WriteDatabase,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsSchema {
    pub properties: HashMap<String, SettingProperty>,
    pub required: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingProperty {
    pub property_type: String,
    pub title: String,
    pub description: Option<String>,
    pub default: Option<serde_json::Value>,
    pub enum_values: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookRegistration {
    pub hook_name: String,
    pub handler: String,
    pub priority: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandRegistration {
    pub name: String,
    pub title: String,
    pub description: Option<String>,
    pub handler: String,
    pub keybinding: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiContribution {
    pub contribution_type: UiContributionType,
    pub location: String,
    pub component: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UiContributionType {
    Panel,
    Toolbar,
    StatusBar,
    ContextMenu,
    Settings,
}

// ============================================
// Plugin Events
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginEvent {
    pub event_type: String,
    pub payload: serde_json::Value,
    pub source: String,
    pub timestamp: i64,
}

// ============================================
// Plugin Manager
// ============================================

pub struct PluginManager {
    pub plugins: HashMap<String, Plugin>,
    pub hooks: HashMap<String, Vec<HookHandler>>,
    pub event_listeners: HashMap<String, Vec<EventListener>>,
    pub plugins_dir: PathBuf,
}

#[derive(Debug, Clone)]
pub struct HookHandler {
    pub plugin_id: String,
    pub handler: String,
    pub priority: i32,
}

#[derive(Debug, Clone)]
pub struct EventListener {
    pub plugin_id: String,
    pub handler: String,
}

impl PluginManager {
    pub fn new(plugins_dir: PathBuf) -> Self {
        Self {
            plugins: HashMap::new(),
            hooks: HashMap::new(),
            event_listeners: HashMap::new(),
            plugins_dir,
        }
    }

    // ============================================
    // Plugin Lifecycle
    // ============================================

    pub fn install_plugin(&mut self, manifest: PluginManifest, wasm_path: &str) -> Result<Plugin, String> {
        // Validate manifest
        self.validate_manifest(&manifest)?;

        let now = chrono::Utc::now().timestamp();
        let plugin = Plugin {
            id: Uuid::new_v4().to_string(),
            manifest: manifest.clone(),
            state: PluginState::Installed,
            settings: self.get_default_settings(&manifest),
            permissions: manifest.permissions.clone(),
            installed_at: now,
            updated_at: now,
        };

        // Register hooks
        for hook in &manifest.hooks {
            self.register_hook(&plugin.id, hook);
        }

        self.plugins.insert(plugin.id.clone(), plugin.clone());
        Ok(plugin)
    }

    pub fn uninstall_plugin(&mut self, plugin_id: &str) -> Result<(), String> {
        let plugin = self.plugins.remove(plugin_id)
            .ok_or_else(|| format!("Plugin not found: {}", plugin_id))?;

        // Unregister hooks
        for (_, handlers) in self.hooks.iter_mut() {
            handlers.retain(|h| h.plugin_id != plugin_id);
        }

        // Unregister event listeners
        for (_, listeners) in self.event_listeners.iter_mut() {
            listeners.retain(|l| l.plugin_id != plugin_id);
        }

        Ok(())
    }

    pub fn enable_plugin(&mut self, plugin_id: &str) -> Result<(), String> {
        let plugin = self.plugins.get_mut(plugin_id)
            .ok_or_else(|| format!("Plugin not found: {}", plugin_id))?;

        plugin.state = PluginState::Enabled;
        plugin.updated_at = chrono::Utc::now().timestamp();
        Ok(())
    }

    pub fn disable_plugin(&mut self, plugin_id: &str) -> Result<(), String> {
        let plugin = self.plugins.get_mut(plugin_id)
            .ok_or_else(|| format!("Plugin not found: {}", plugin_id))?;

        plugin.state = PluginState::Disabled;
        plugin.updated_at = chrono::Utc::now().timestamp();
        Ok(())
    }

    pub fn get_plugin(&self, plugin_id: &str) -> Option<&Plugin> {
        self.plugins.get(plugin_id)
    }

    pub fn list_plugins(&self) -> Vec<&Plugin> {
        self.plugins.values().collect()
    }

    pub fn list_enabled_plugins(&self) -> Vec<&Plugin> {
        self.plugins.values()
            .filter(|p| matches!(p.state, PluginState::Enabled))
            .collect()
    }

    // ============================================
    // Plugin Settings
    // ============================================

    pub fn get_plugin_settings(&self, plugin_id: &str) -> Result<HashMap<String, serde_json::Value>, String> {
        let plugin = self.plugins.get(plugin_id)
            .ok_or_else(|| format!("Plugin not found: {}", plugin_id))?;
        Ok(plugin.settings.clone())
    }

    pub fn update_plugin_settings(
        &mut self,
        plugin_id: &str,
        settings: HashMap<String, serde_json::Value>,
    ) -> Result<(), String> {
        let plugin = self.plugins.get_mut(plugin_id)
            .ok_or_else(|| format!("Plugin not found: {}", plugin_id))?;

        plugin.settings = settings;
        plugin.updated_at = chrono::Utc::now().timestamp();
        Ok(())
    }

    fn get_default_settings(&self, manifest: &PluginManifest) -> HashMap<String, serde_json::Value> {
        let mut settings = HashMap::new();
        if let Some(schema) = &manifest.settings_schema {
            for (key, prop) in &schema.properties {
                if let Some(default) = &prop.default {
                    settings.insert(key.clone(), default.clone());
                }
            }
        }
        settings
    }

    // ============================================
    // Hook System
    // ============================================

    fn register_hook(&mut self, plugin_id: &str, registration: &HookRegistration) {
        let handler = HookHandler {
            plugin_id: plugin_id.to_string(),
            handler: registration.handler.clone(),
            priority: registration.priority,
        };

        self.hooks
            .entry(registration.hook_name.clone())
            .or_insert_with(Vec::new)
            .push(handler);

        // Sort by priority
        if let Some(handlers) = self.hooks.get_mut(&registration.hook_name) {
            handlers.sort_by_key(|h| h.priority);
        }
    }

    pub fn get_hook_handlers(&self, hook_name: &str) -> Vec<&HookHandler> {
        self.hooks.get(hook_name)
            .map(|handlers| handlers.iter().collect())
            .unwrap_or_default()
    }

    // ============================================
    // Event System
    // ============================================

    pub fn subscribe(&mut self, plugin_id: &str, event_type: &str, handler: &str) {
        let listener = EventListener {
            plugin_id: plugin_id.to_string(),
            handler: handler.to_string(),
        };

        self.event_listeners
            .entry(event_type.to_string())
            .or_insert_with(Vec::new)
            .push(listener);
    }

    pub fn unsubscribe(&mut self, plugin_id: &str, event_type: &str) {
        if let Some(listeners) = self.event_listeners.get_mut(event_type) {
            listeners.retain(|l| l.plugin_id != plugin_id);
        }
    }

    pub fn get_event_listeners(&self, event_type: &str) -> Vec<&EventListener> {
        self.event_listeners.get(event_type)
            .map(|listeners| listeners.iter().collect())
            .unwrap_or_default()
    }

    // ============================================
    // Validation
    // ============================================

    fn validate_manifest(&self, manifest: &PluginManifest) -> Result<(), String> {
        if manifest.name.is_empty() {
            return Err("Plugin name is required".to_string());
        }
        if manifest.version.is_empty() {
            return Err("Plugin version is required".to_string());
        }
        if manifest.entry_point.is_empty() {
            return Err("Plugin entry point is required".to_string());
        }
        Ok(())
    }

    // ============================================
    // Permission Checking
    // ============================================

    pub fn check_permission(&self, plugin_id: &str, permission: &Permission) -> bool {
        self.plugins.get(plugin_id)
            .map(|p| p.permissions.contains(permission))
            .unwrap_or(false)
    }

    pub fn request_permission(&mut self, plugin_id: &str, permission: Permission) -> Result<(), String> {
        let plugin = self.plugins.get_mut(plugin_id)
            .ok_or_else(|| format!("Plugin not found: {}", plugin_id))?;

        if !plugin.permissions.contains(&permission) {
            plugin.permissions.push(permission);
        }
        Ok(())
    }
}

// ============================================
// Plugin SDK Types (for plugin developers)
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginContext {
    pub plugin_id: String,
    pub workspace_id: Option<String>,
    pub settings: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginApi {
    pub version: String,
    pub available_hooks: Vec<String>,
    pub available_events: Vec<String>,
    pub available_services: Vec<String>,
}

impl PluginApi {
    pub fn new() -> Self {
        Self {
            version: "1.0.0".to_string(),
            available_hooks: vec![
                "onInit".to_string(),
                "onActivate".to_string(),
                "onDeactivate".to_string(),
                "onWorkspaceOpen".to_string(),
                "onWorkspaceClose".to_string(),
                "onDocumentCreate".to_string(),
                "onDocumentSave".to_string(),
                "onDocumentDelete".to_string(),
                "onTaskCreate".to_string(),
                "onTaskComplete".to_string(),
                "onExport".to_string(),
            ],
            available_events: vec![
                "workspace.changed".to_string(),
                "document.changed".to_string(),
                "task.changed".to_string(),
                "settings.changed".to_string(),
                "theme.changed".to_string(),
            ],
            available_services: vec![
                "workspace".to_string(),
                "document".to_string(),
                "task".to_string(),
                "settings".to_string(),
                "ui".to_string(),
                "notification".to_string(),
                "storage".to_string(),
            ],
        }
    }
}

// ============================================
// Plugin Template
// ============================================

pub fn get_plugin_template() -> String {
    r#"{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "A SmartSpecPro plugin",
  "author": "Your Name",
  "category": "other",
  "tags": [],
  "min_app_version": "1.0.0",
  "entry_point": "main.wasm",
  "permissions": [],
  "settings_schema": {
    "properties": {},
    "required": []
  },
  "hooks": [],
  "commands": [],
  "ui_contributions": []
}"#.to_string()
}
