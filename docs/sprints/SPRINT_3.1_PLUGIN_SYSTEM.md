# Sprint 3.1: Plugin System

**Duration:** 2 สัปดาห์ (10-14 วันทำงาน)  
**Priority:** Critical  
**Dependencies:** Phase 2 Complete  

---

## 🎯 Sprint Goal

สร้าง Plugin System ที่ช่วยให้:
1. ขยายความสามารถของ SmartSpecPro ด้วย plugins
2. รัน plugins อย่างปลอดภัยใน sandbox
3. มี API ที่ชัดเจนสำหรับ plugin developers
4. รองรับ official และ community plugins

---

## 📋 User Stories

### US-3.1.1: Plugin Installation
> **As a** user  
> **I want** to install plugins from marketplace or local files  
> **So that** I can extend SmartSpecPro functionality

**Acceptance Criteria:**
- [ ] Install from marketplace
- [ ] Install from local file (.zip)
- [ ] View installed plugins
- [ ] Enable/disable plugins
- [ ] Uninstall plugins

### US-3.1.2: Plugin Configuration
> **As a** user  
> **I want** to configure plugin settings  
> **So that** I can customize plugin behavior

**Acceptance Criteria:**
- [ ] Plugin settings UI
- [ ] Per-workspace settings
- [ ] Global settings
- [ ] Reset to defaults
- [ ] Import/export settings

### US-3.1.3: Plugin Development
> **As a** developer  
> **I want** to create plugins for SmartSpecPro  
> **So that** I can add custom features

**Acceptance Criteria:**
- [ ] Plugin SDK
- [ ] Plugin template
- [ ] Development documentation
- [ ] Hot reload during development
- [ ] Plugin testing tools

### US-3.1.4: Plugin Security
> **As a** user  
> **I want** plugins to run in a secure sandbox  
> **So that** malicious plugins cannot harm my system

**Acceptance Criteria:**
- [ ] WASM sandbox
- [ ] Permission system
- [ ] Resource limits
- [ ] Code signing (optional)
- [ ] Security audit logs

---

## 🏗️ Technical Architecture

### Plugin Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PLUGIN ARCHITECTURE                                    │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  SMARTSPECPRO HOST                                                           │
    │                                                                              │
    │  ┌─────────────────────────────────────────────────────────────────────────┐│
    │  │  Plugin Manager                                                         ││
    │  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               ││
    │  │  │   Registry    │  │    Loader     │  │   Lifecycle   │               ││
    │  │  │               │  │               │  │               │               ││
    │  │  │ • Discover    │  │ • Load WASM   │  │ • Initialize  │               ││
    │  │  │ • Register    │  │ • Validate    │  │ • Start       │               ││
    │  │  │ • Unregister  │  │ • Instantiate │  │ • Stop        │               ││
    │  │  └───────────────┘  └───────────────┘  └───────────────┘               ││
    │  └─────────────────────────────────────────────────────────────────────────┘│
    │                                      │                                       │
    │                                      ▼                                       │
    │  ┌─────────────────────────────────────────────────────────────────────────┐│
    │  │  Plugin API                                                             ││
    │  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               ││
    │  │  │    Hooks      │  │    Events     │  │   Services    │               ││
    │  │  │               │  │               │  │               │               ││
    │  │  │ • onInit      │  │ • emit()      │  │ • workspace   │               ││
    │  │  │ • onTask      │  │ • subscribe() │  │ • ai          │               ││
    │  │  │ • onSpec      │  │ • unsubscribe │  │ • storage     │               ││
    │  │  │ • onBuild     │  │               │  │ • ui          │               ││
    │  │  └───────────────┘  └───────────────┘  └───────────────┘               ││
    │  └─────────────────────────────────────────────────────────────────────────┘│
    │                                      │                                       │
    │                                      ▼                                       │
    │  ┌─────────────────────────────────────────────────────────────────────────┐│
    │  │  Plugin Sandbox (WASM)                                                  ││
    │  │  ┌───────────────────────────────────────────────────────────────────┐ ││
    │  │  │  Plugin Instance                                                  │ ││
    │  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │ ││
    │  │  │  │   Memory    │  │    CPU      │  │   Network   │               │ ││
    │  │  │  │   Limit     │  │   Limit     │  │   Limit     │               │ ││
    │  │  │  │   64MB      │  │   100ms     │  │   Allowed   │               │ ││
    │  │  │  └─────────────┘  └─────────────┘  └─────────────┘               │ ││
    │  │  └───────────────────────────────────────────────────────────────────┘ ││
    │  └─────────────────────────────────────────────────────────────────────────┘│
    └──────────────────────────────────────────────────────────────────────────────┘
```

### Plugin Manifest

```json
{
  "name": "github-integration",
  "version": "1.0.0",
  "displayName": "GitHub Integration",
  "description": "Integrate SmartSpecPro with GitHub",
  "author": {
    "name": "SmartSpecPro Team",
    "email": "plugins@smartspecpro.com"
  },
  "license": "MIT",
  "repository": "https://github.com/smartspecpro/plugin-github",
  "main": "dist/plugin.wasm",
  "ui": "dist/ui.js",
  "icon": "assets/icon.png",
  "categories": ["integration", "vcs"],
  "keywords": ["github", "git", "version-control"],
  "permissions": [
    "network:api.github.com",
    "storage:local",
    "workspace:read",
    "workspace:write"
  ],
  "settings": {
    "type": "object",
    "properties": {
      "token": {
        "type": "string",
        "title": "GitHub Token",
        "description": "Personal access token for GitHub API",
        "secret": true
      },
      "defaultBranch": {
        "type": "string",
        "title": "Default Branch",
        "default": "main"
      }
    }
  },
  "hooks": [
    "onTaskCreate",
    "onTaskComplete",
    "onSpecApprove"
  ],
  "commands": [
    {
      "id": "github.createPR",
      "title": "Create Pull Request",
      "shortcut": "Ctrl+Shift+P"
    },
    {
      "id": "github.syncIssues",
      "title": "Sync GitHub Issues"
    }
  ],
  "menus": [
    {
      "location": "taskContextMenu",
      "items": [
        {
          "id": "github.linkIssue",
          "title": "Link to GitHub Issue"
        }
      ]
    }
  ],
  "minHostVersion": "1.0.0",
  "engines": {
    "smartspecpro": ">=1.0.0"
  }
}
```

### Plugin Types

```typescript
// Plugin types
type PluginType = 'integration' | 'ui' | 'ai' | 'theme' | 'utility';

// Permission types
type Permission = 
  | `network:${string}`      // Network access to specific domains
  | 'storage:local'          // Local storage access
  | 'storage:sync'           // Synced storage access
  | 'workspace:read'         // Read workspace data
  | 'workspace:write'        // Write workspace data
  | 'ai:invoke'              // Invoke AI services
  | 'ui:panel'               // Add UI panels
  | 'ui:statusbar'           // Add status bar items
  | 'ui:contextmenu'         // Add context menu items
  | 'clipboard:read'         // Read clipboard
  | 'clipboard:write'        // Write clipboard
  | 'notifications'          // Show notifications
  | 'shell:execute';         // Execute shell commands (dangerous)

// Hook types
type HookType = 
  | 'onInit'
  | 'onDestroy'
  | 'onWorkspaceOpen'
  | 'onWorkspaceClose'
  | 'onTaskCreate'
  | 'onTaskUpdate'
  | 'onTaskComplete'
  | 'onSpecCreate'
  | 'onSpecUpdate'
  | 'onSpecApprove'
  | 'onBuildStart'
  | 'onBuildComplete'
  | 'onError';
```

---

## 📁 Implementation Tasks

### Week 1: Plugin Host & API

#### Task 3.1.1: Plugin Host (Rust)
**File:** `desktop-app/src-tauri/src/plugin_host/mod.rs`

```rust
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use wasmtime::{Engine, Module, Store, Instance, Linker};

pub mod manifest;
pub mod sandbox;
pub mod api;
pub mod lifecycle;

use manifest::PluginManifest;
use sandbox::PluginSandbox;

#[derive(Debug, Clone)]
pub struct PluginInfo {
    pub id: String,
    pub manifest: PluginManifest,
    pub path: PathBuf,
    pub enabled: bool,
    pub status: PluginStatus,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PluginStatus {
    Installed,
    Loading,
    Running,
    Error(String),
    Disabled,
}

pub struct PluginHost {
    engine: Engine,
    plugins: Arc<RwLock<HashMap<String, PluginInstance>>>,
    registry: Arc<RwLock<HashMap<String, PluginInfo>>>,
    hooks: Arc<RwLock<HookRegistry>>,
    plugins_dir: PathBuf,
}

struct PluginInstance {
    info: PluginInfo,
    store: Store<PluginState>,
    instance: Instance,
    sandbox: PluginSandbox,
}

struct PluginState {
    memory_used: usize,
    cpu_time: std::time::Duration,
    permissions: Vec<String>,
}

impl PluginHost {
    pub fn new(plugins_dir: PathBuf) -> Result<Self, Error> {
        let engine = Engine::default();
        
        Ok(Self {
            engine,
            plugins: Arc::new(RwLock::new(HashMap::new())),
            registry: Arc::new(RwLock::new(HashMap::new())),
            hooks: Arc::new(RwLock::new(HookRegistry::new())),
            plugins_dir,
        })
    }
    
    pub async fn discover_plugins(&self) -> Result<Vec<PluginInfo>, Error> {
        let mut plugins = Vec::new();
        
        // Scan plugins directory
        let entries = std::fs::read_dir(&self.plugins_dir)?;
        
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_dir() {
                let manifest_path = path.join("manifest.json");
                if manifest_path.exists() {
                    match self.load_manifest(&manifest_path) {
                        Ok(manifest) => {
                            let info = PluginInfo {
                                id: manifest.name.clone(),
                                manifest,
                                path,
                                enabled: true,
                                status: PluginStatus::Installed,
                            };
                            plugins.push(info);
                        }
                        Err(e) => {
                            log::warn!("Failed to load plugin manifest: {:?}", e);
                        }
                    }
                }
            }
        }
        
        // Update registry
        let mut registry = self.registry.write().await;
        for plugin in &plugins {
            registry.insert(plugin.id.clone(), plugin.clone());
        }
        
        Ok(plugins)
    }
    
    fn load_manifest(&self, path: &PathBuf) -> Result<PluginManifest, Error> {
        let content = std::fs::read_to_string(path)?;
        let manifest: PluginManifest = serde_json::from_str(&content)?;
        manifest.validate()?;
        Ok(manifest)
    }
    
    pub async fn install_plugin(&self, source: PluginSource) -> Result<PluginInfo, Error> {
        let (manifest, path) = match source {
            PluginSource::Marketplace { id, version } => {
                self.download_from_marketplace(&id, &version).await?
            }
            PluginSource::LocalFile { path } => {
                self.install_from_file(&path).await?
            }
            PluginSource::Url { url } => {
                self.install_from_url(&url).await?
            }
        };
        
        let info = PluginInfo {
            id: manifest.name.clone(),
            manifest,
            path,
            enabled: true,
            status: PluginStatus::Installed,
        };
        
        // Register plugin
        let mut registry = self.registry.write().await;
        registry.insert(info.id.clone(), info.clone());
        
        Ok(info)
    }
    
    pub async fn load_plugin(&self, id: &str) -> Result<(), Error> {
        let mut registry = self.registry.write().await;
        let info = registry.get_mut(id).ok_or(Error::PluginNotFound)?;
        
        if !info.enabled {
            return Err(Error::PluginDisabled);
        }
        
        info.status = PluginStatus::Loading;
        drop(registry);
        
        // Load WASM module
        let wasm_path = self.get_plugin_path(id).join(&info.manifest.main);
        let module = Module::from_file(&self.engine, &wasm_path)?;
        
        // Create sandbox
        let sandbox = PluginSandbox::new(
            &info.manifest.permissions,
            PluginLimits {
                memory_mb: 64,
                cpu_ms: 100,
                network_allowed: info.manifest.permissions.iter()
                    .any(|p| p.starts_with("network:")),
            },
        )?;
        
        // Create store with state
        let state = PluginState {
            memory_used: 0,
            cpu_time: std::time::Duration::ZERO,
            permissions: info.manifest.permissions.clone(),
        };
        let mut store = Store::new(&self.engine, state);
        
        // Create linker with API
        let mut linker = Linker::new(&self.engine);
        self.register_api(&mut linker, &sandbox)?;
        
        // Instantiate
        let instance = linker.instantiate(&mut store, &module)?;
        
        // Call init
        let init = instance.get_typed_func::<(), ()>(&mut store, "init")?;
        init.call(&mut store, ())?;
        
        // Store instance
        let plugin_instance = PluginInstance {
            info: info.clone(),
            store,
            instance,
            sandbox,
        };
        
        let mut plugins = self.plugins.write().await;
        plugins.insert(id.to_string(), plugin_instance);
        
        // Update status
        let mut registry = self.registry.write().await;
        if let Some(info) = registry.get_mut(id) {
            info.status = PluginStatus::Running;
        }
        
        // Register hooks
        self.register_hooks(id, &info.manifest.hooks).await?;
        
        Ok(())
    }
    
    pub async fn unload_plugin(&self, id: &str) -> Result<(), Error> {
        // Call destroy hook
        self.call_hook(id, "onDestroy", serde_json::Value::Null).await?;
        
        // Remove instance
        let mut plugins = self.plugins.write().await;
        plugins.remove(id);
        
        // Unregister hooks
        let mut hooks = self.hooks.write().await;
        hooks.unregister_plugin(id);
        
        // Update status
        let mut registry = self.registry.write().await;
        if let Some(info) = registry.get_mut(id) {
            info.status = PluginStatus::Installed;
        }
        
        Ok(())
    }
    
    pub async fn enable_plugin(&self, id: &str) -> Result<(), Error> {
        let mut registry = self.registry.write().await;
        if let Some(info) = registry.get_mut(id) {
            info.enabled = true;
            info.status = PluginStatus::Installed;
        }
        drop(registry);
        
        self.load_plugin(id).await
    }
    
    pub async fn disable_plugin(&self, id: &str) -> Result<(), Error> {
        self.unload_plugin(id).await?;
        
        let mut registry = self.registry.write().await;
        if let Some(info) = registry.get_mut(id) {
            info.enabled = false;
            info.status = PluginStatus::Disabled;
        }
        
        Ok(())
    }
    
    pub async fn uninstall_plugin(&self, id: &str) -> Result<(), Error> {
        // Unload first
        self.unload_plugin(id).await.ok();
        
        // Remove files
        let path = self.get_plugin_path(id);
        std::fs::remove_dir_all(&path)?;
        
        // Remove from registry
        let mut registry = self.registry.write().await;
        registry.remove(id);
        
        Ok(())
    }
    
    // Hook system
    async fn register_hooks(&self, plugin_id: &str, hooks: &[String]) -> Result<(), Error> {
        let mut hook_registry = self.hooks.write().await;
        
        for hook in hooks {
            hook_registry.register(hook, plugin_id);
        }
        
        Ok(())
    }
    
    pub async fn trigger_hook(&self, hook: &str, data: serde_json::Value) -> Result<Vec<serde_json::Value>, Error> {
        let hooks = self.hooks.read().await;
        let plugin_ids = hooks.get_plugins(hook);
        
        let mut results = Vec::new();
        
        for plugin_id in plugin_ids {
            match self.call_hook(&plugin_id, hook, data.clone()).await {
                Ok(result) => results.push(result),
                Err(e) => log::error!("Plugin {} hook {} failed: {:?}", plugin_id, hook, e),
            }
        }
        
        Ok(results)
    }
    
    async fn call_hook(&self, plugin_id: &str, hook: &str, data: serde_json::Value) -> Result<serde_json::Value, Error> {
        let mut plugins = self.plugins.write().await;
        let plugin = plugins.get_mut(plugin_id).ok_or(Error::PluginNotLoaded)?;
        
        // Serialize data
        let data_str = serde_json::to_string(&data)?;
        
        // Call hook function
        let hook_fn = plugin.instance.get_typed_func::<(i32, i32), i32>(&mut plugin.store, hook)?;
        
        // Allocate memory for input
        let alloc = plugin.instance.get_typed_func::<i32, i32>(&mut plugin.store, "alloc")?;
        let ptr = alloc.call(&mut plugin.store, data_str.len() as i32)?;
        
        // Write data to memory
        let memory = plugin.instance.get_memory(&mut plugin.store, "memory").unwrap();
        memory.write(&mut plugin.store, ptr as usize, data_str.as_bytes())?;
        
        // Call hook
        let result_ptr = hook_fn.call(&mut plugin.store, (ptr, data_str.len() as i32))?;
        
        // Read result
        let result = self.read_string_from_memory(&mut plugin.store, &memory, result_ptr)?;
        let result_value: serde_json::Value = serde_json::from_str(&result)?;
        
        Ok(result_value)
    }
    
    fn get_plugin_path(&self, id: &str) -> PathBuf {
        self.plugins_dir.join(id)
    }
}

struct HookRegistry {
    hooks: HashMap<String, Vec<String>>,
}

impl HookRegistry {
    fn new() -> Self {
        Self {
            hooks: HashMap::new(),
        }
    }
    
    fn register(&mut self, hook: &str, plugin_id: &str) {
        self.hooks
            .entry(hook.to_string())
            .or_insert_with(Vec::new)
            .push(plugin_id.to_string());
    }
    
    fn unregister_plugin(&mut self, plugin_id: &str) {
        for plugins in self.hooks.values_mut() {
            plugins.retain(|id| id != plugin_id);
        }
    }
    
    fn get_plugins(&self, hook: &str) -> Vec<String> {
        self.hooks.get(hook).cloned().unwrap_or_default()
    }
}
```

**Deliverables:**
- [ ] Plugin discovery
- [ ] Plugin loading (WASM)
- [ ] Plugin lifecycle
- [ ] Hook system

#### Task 3.1.2: Plugin Sandbox
**File:** `desktop-app/src-tauri/src/plugin_host/sandbox.rs`

```rust
use std::collections::HashSet;

pub struct PluginLimits {
    pub memory_mb: usize,
    pub cpu_ms: u64,
    pub network_allowed: bool,
}

pub struct PluginSandbox {
    permissions: HashSet<String>,
    limits: PluginLimits,
    network_whitelist: Vec<String>,
}

impl PluginSandbox {
    pub fn new(permissions: &[String], limits: PluginLimits) -> Result<Self, Error> {
        let mut permission_set = HashSet::new();
        let mut network_whitelist = Vec::new();
        
        for perm in permissions {
            if perm.starts_with("network:") {
                let domain = perm.strip_prefix("network:").unwrap();
                network_whitelist.push(domain.to_string());
            }
            permission_set.insert(perm.clone());
        }
        
        Ok(Self {
            permissions: permission_set,
            limits,
            network_whitelist,
        })
    }
    
    pub fn check_permission(&self, permission: &str) -> bool {
        self.permissions.contains(permission)
    }
    
    pub fn check_network(&self, url: &str) -> bool {
        if !self.limits.network_allowed {
            return false;
        }
        
        // Parse URL and check against whitelist
        if let Ok(parsed) = url::Url::parse(url) {
            if let Some(host) = parsed.host_str() {
                return self.network_whitelist.iter().any(|domain| {
                    host == domain || host.ends_with(&format!(".{}", domain))
                });
            }
        }
        
        false
    }
    
    pub fn check_memory(&self, current_mb: usize) -> bool {
        current_mb <= self.limits.memory_mb
    }
    
    pub fn check_cpu(&self, elapsed_ms: u64) -> bool {
        elapsed_ms <= self.limits.cpu_ms
    }
}
```

**Deliverables:**
- [ ] Permission checking
- [ ] Network whitelist
- [ ] Resource limits

#### Task 3.1.3: Plugin API
**File:** `desktop-app/src-tauri/src/plugin_host/api.rs`

```rust
use wasmtime::Linker;

impl PluginHost {
    pub fn register_api(&self, linker: &mut Linker<PluginState>, sandbox: &PluginSandbox) -> Result<(), Error> {
        // Workspace API
        self.register_workspace_api(linker, sandbox)?;
        
        // Storage API
        self.register_storage_api(linker, sandbox)?;
        
        // UI API
        self.register_ui_api(linker, sandbox)?;
        
        // Network API
        self.register_network_api(linker, sandbox)?;
        
        // AI API
        self.register_ai_api(linker, sandbox)?;
        
        // Event API
        self.register_event_api(linker)?;
        
        Ok(())
    }
    
    fn register_workspace_api(&self, linker: &mut Linker<PluginState>, sandbox: &PluginSandbox) -> Result<(), Error> {
        let can_read = sandbox.check_permission("workspace:read");
        let can_write = sandbox.check_permission("workspace:write");
        
        // workspace.getTasks()
        if can_read {
            linker.func_wrap("env", "workspace_get_tasks", |caller: Caller<'_, PluginState>| -> i32 {
                // Implementation
                0
            })?;
            
            // workspace.getSpecs()
            linker.func_wrap("env", "workspace_get_specs", |caller: Caller<'_, PluginState>| -> i32 {
                0
            })?;
            
            // workspace.getKnowledge()
            linker.func_wrap("env", "workspace_get_knowledge", |caller: Caller<'_, PluginState>| -> i32 {
                0
            })?;
        }
        
        if can_write {
            // workspace.createTask()
            linker.func_wrap("env", "workspace_create_task", |caller: Caller<'_, PluginState>, ptr: i32, len: i32| -> i32 {
                0
            })?;
            
            // workspace.updateTask()
            linker.func_wrap("env", "workspace_update_task", |caller: Caller<'_, PluginState>, ptr: i32, len: i32| -> i32 {
                0
            })?;
        }
        
        Ok(())
    }
    
    fn register_storage_api(&self, linker: &mut Linker<PluginState>, sandbox: &PluginSandbox) -> Result<(), Error> {
        let can_local = sandbox.check_permission("storage:local");
        
        if can_local {
            // storage.get()
            linker.func_wrap("env", "storage_get", |caller: Caller<'_, PluginState>, key_ptr: i32, key_len: i32| -> i32 {
                0
            })?;
            
            // storage.set()
            linker.func_wrap("env", "storage_set", |caller: Caller<'_, PluginState>, key_ptr: i32, key_len: i32, val_ptr: i32, val_len: i32| -> i32 {
                0
            })?;
            
            // storage.delete()
            linker.func_wrap("env", "storage_delete", |caller: Caller<'_, PluginState>, key_ptr: i32, key_len: i32| -> i32 {
                0
            })?;
        }
        
        Ok(())
    }
    
    fn register_network_api(&self, linker: &mut Linker<PluginState>, sandbox: &PluginSandbox) -> Result<(), Error> {
        let sandbox_clone = sandbox.clone();
        
        // network.fetch()
        linker.func_wrap("env", "network_fetch", move |caller: Caller<'_, PluginState>, url_ptr: i32, url_len: i32, opts_ptr: i32, opts_len: i32| -> i32 {
            // Check URL against whitelist
            // Perform fetch
            0
        })?;
        
        Ok(())
    }
    
    fn register_ui_api(&self, linker: &mut Linker<PluginState>, sandbox: &PluginSandbox) -> Result<(), Error> {
        let can_panel = sandbox.check_permission("ui:panel");
        let can_notification = sandbox.check_permission("notifications");
        
        if can_panel {
            // ui.registerPanel()
            linker.func_wrap("env", "ui_register_panel", |caller: Caller<'_, PluginState>, config_ptr: i32, config_len: i32| -> i32 {
                0
            })?;
        }
        
        if can_notification {
            // ui.showNotification()
            linker.func_wrap("env", "ui_show_notification", |caller: Caller<'_, PluginState>, msg_ptr: i32, msg_len: i32| -> i32 {
                0
            })?;
        }
        
        Ok(())
    }
    
    fn register_ai_api(&self, linker: &mut Linker<PluginState>, sandbox: &PluginSandbox) -> Result<(), Error> {
        let can_invoke = sandbox.check_permission("ai:invoke");
        
        if can_invoke {
            // ai.complete()
            linker.func_wrap("env", "ai_complete", |caller: Caller<'_, PluginState>, prompt_ptr: i32, prompt_len: i32| -> i32 {
                0
            })?;
            
            // ai.embed()
            linker.func_wrap("env", "ai_embed", |caller: Caller<'_, PluginState>, text_ptr: i32, text_len: i32| -> i32 {
                0
            })?;
        }
        
        Ok(())
    }
    
    fn register_event_api(&self, linker: &mut Linker<PluginState>) -> Result<(), Error> {
        // events.emit()
        linker.func_wrap("env", "events_emit", |caller: Caller<'_, PluginState>, event_ptr: i32, event_len: i32, data_ptr: i32, data_len: i32| -> i32 {
            0
        })?;
        
        // events.subscribe()
        linker.func_wrap("env", "events_subscribe", |caller: Caller<'_, PluginState>, event_ptr: i32, event_len: i32, callback_ptr: i32| -> i32 {
            0
        })?;
        
        Ok(())
    }
}
```

**Deliverables:**
- [ ] Workspace API
- [ ] Storage API
- [ ] Network API
- [ ] UI API
- [ ] AI API
- [ ] Event API

#### Task 3.1.4: Tauri Commands
**File:** `desktop-app/src-tauri/src/plugin_host/commands.rs`

```rust
#[tauri::command]
pub async fn list_plugins(
    host: State<'_, PluginHost>,
) -> Result<Vec<PluginInfo>, String> {
    let registry = host.registry.read().await;
    Ok(registry.values().cloned().collect())
}

#[tauri::command]
pub async fn install_plugin(
    source: PluginSource,
    host: State<'_, PluginHost>,
) -> Result<PluginInfo, String> {
    host.install_plugin(source).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn uninstall_plugin(
    id: String,
    host: State<'_, PluginHost>,
) -> Result<(), String> {
    host.uninstall_plugin(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn enable_plugin(
    id: String,
    host: State<'_, PluginHost>,
) -> Result<(), String> {
    host.enable_plugin(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn disable_plugin(
    id: String,
    host: State<'_, PluginHost>,
) -> Result<(), String> {
    host.disable_plugin(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_plugin_settings(
    id: String,
    host: State<'_, PluginHost>,
) -> Result<serde_json::Value, String> {
    host.get_plugin_settings(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_plugin_settings(
    id: String,
    settings: serde_json::Value,
    host: State<'_, PluginHost>,
) -> Result<(), String> {
    host.update_plugin_settings(&id, settings).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn call_plugin_command(
    plugin_id: String,
    command_id: String,
    args: serde_json::Value,
    host: State<'_, PluginHost>,
) -> Result<serde_json::Value, String> {
    host.call_command(&plugin_id, &command_id, args).await.map_err(|e| e.to_string())
}
```

**Deliverables:**
- [ ] List plugins command
- [ ] Install/uninstall commands
- [ ] Enable/disable commands
- [ ] Settings commands
- [ ] Call command

---

### Week 2: Frontend & SDK

#### Task 3.1.5: Plugin Service (TypeScript)
**File:** `desktop-app/src/services/pluginService.ts`

```typescript
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

export interface PluginInfo {
  id: string;
  manifest: PluginManifest;
  path: string;
  enabled: boolean;
  status: PluginStatus;
}

export interface PluginManifest {
  name: string;
  version: string;
  displayName: string;
  description: string;
  author: { name: string; email: string };
  icon: string;
  categories: string[];
  permissions: string[];
  settings: any;
  commands: PluginCommand[];
}

export interface PluginCommand {
  id: string;
  title: string;
  shortcut?: string;
}

export type PluginStatus = 'Installed' | 'Loading' | 'Running' | 'Error' | 'Disabled';

export type PluginSource = 
  | { type: 'marketplace'; id: string; version: string }
  | { type: 'localFile'; path: string }
  | { type: 'url'; url: string };

class PluginService {
  async listPlugins(): Promise<PluginInfo[]> {
    return invoke('list_plugins');
  }
  
  async installPlugin(source: PluginSource): Promise<PluginInfo> {
    return invoke('install_plugin', { source });
  }
  
  async uninstallPlugin(id: string): Promise<void> {
    return invoke('uninstall_plugin', { id });
  }
  
  async enablePlugin(id: string): Promise<void> {
    return invoke('enable_plugin', { id });
  }
  
  async disablePlugin(id: string): Promise<void> {
    return invoke('disable_plugin', { id });
  }
  
  async getPluginSettings(id: string): Promise<any> {
    return invoke('get_plugin_settings', { id });
  }
  
  async updatePluginSettings(id: string, settings: any): Promise<void> {
    return invoke('update_plugin_settings', { id, settings });
  }
  
  async callCommand(pluginId: string, commandId: string, args?: any): Promise<any> {
    return invoke('call_plugin_command', { pluginId, commandId, args: args || {} });
  }
  
  async subscribeToPluginEvents(callback: (event: PluginEvent) => void): Promise<() => void> {
    return listen<PluginEvent>('plugin:event', (event) => {
      callback(event.payload);
    });
  }
}

export const pluginService = new PluginService();
```

**Deliverables:**
- [ ] TypeScript service
- [ ] Type definitions
- [ ] Event subscription

#### Task 3.1.6: Plugin Manager UI
**File:** `desktop-app/src/pages/Plugins/PluginManager.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { pluginService, PluginInfo } from '@/services/pluginService';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

export function PluginManager() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlugin, setSelectedPlugin] = useState<PluginInfo | null>(null);
  
  useEffect(() => {
    loadPlugins();
  }, []);
  
  const loadPlugins = async () => {
    setLoading(true);
    try {
      const data = await pluginService.listPlugins();
      setPlugins(data);
    } finally {
      setLoading(false);
    }
  };
  
  const handleToggle = async (plugin: PluginInfo) => {
    if (plugin.enabled) {
      await pluginService.disablePlugin(plugin.id);
    } else {
      await pluginService.enablePlugin(plugin.id);
    }
    loadPlugins();
  };
  
  const handleUninstall = async (plugin: PluginInfo) => {
    if (confirm(`Uninstall ${plugin.manifest.displayName}?`)) {
      await pluginService.uninstallPlugin(plugin.id);
      loadPlugins();
    }
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Running': return 'green';
      case 'Loading': return 'blue';
      case 'Error': return 'red';
      case 'Disabled': return 'gray';
      default: return 'gray';
    }
  };
  
  return (
    <div className="plugin-manager">
      <div className="manager-header">
        <h2>Plugins</h2>
        <div className="header-actions">
          <Button variant="outline" onClick={() => setShowInstallDialog(true)}>
            Install Plugin
          </Button>
          <Button onClick={() => window.open('/marketplace/plugins')}>
            Browse Marketplace
          </Button>
        </div>
      </div>
      
      <div className="plugin-list">
        {loading ? (
          <LoadingSkeleton />
        ) : plugins.length === 0 ? (
          <EmptyState message="No plugins installed" />
        ) : (
          plugins.map((plugin) => (
            <div
              key={plugin.id}
              className={`plugin-card ${selectedPlugin?.id === plugin.id ? 'selected' : ''}`}
              onClick={() => setSelectedPlugin(plugin)}
            >
              <div className="plugin-icon">
                <img src={plugin.manifest.icon} alt={plugin.manifest.displayName} />
              </div>
              
              <div className="plugin-info">
                <div className="plugin-header">
                  <h3>{plugin.manifest.displayName}</h3>
                  <Badge color={getStatusColor(plugin.status)}>
                    {plugin.status}
                  </Badge>
                </div>
                <p className="plugin-description">{plugin.manifest.description}</p>
                <div className="plugin-meta">
                  <span>v{plugin.manifest.version}</span>
                  <span>by {plugin.manifest.author.name}</span>
                </div>
              </div>
              
              <div className="plugin-actions">
                <Switch
                  checked={plugin.enabled}
                  onCheckedChange={() => handleToggle(plugin)}
                />
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* Plugin Details Panel */}
      {selectedPlugin && (
        <PluginDetails
          plugin={selectedPlugin}
          onClose={() => setSelectedPlugin(null)}
          onUninstall={() => handleUninstall(selectedPlugin)}
          onSettingsChange={loadPlugins}
        />
      )}
      
      {/* Install Dialog */}
      <InstallPluginDialog
        open={showInstallDialog}
        onClose={() => setShowInstallDialog(false)}
        onInstall={loadPlugins}
      />
    </div>
  );
}

function PluginDetails({ plugin, onClose, onUninstall, onSettingsChange }) {
  const [settings, setSettings] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'permissions'>('overview');
  
  useEffect(() => {
    loadSettings();
  }, [plugin.id]);
  
  const loadSettings = async () => {
    const data = await pluginService.getPluginSettings(plugin.id);
    setSettings(data);
  };
  
  const handleSaveSettings = async () => {
    await pluginService.updatePluginSettings(plugin.id, settings);
    onSettingsChange();
  };
  
  return (
    <div className="plugin-details">
      <div className="details-header">
        <img src={plugin.manifest.icon} alt={plugin.manifest.displayName} />
        <div>
          <h2>{plugin.manifest.displayName}</h2>
          <p>v{plugin.manifest.version} by {plugin.manifest.author.name}</p>
        </div>
        <button onClick={onClose}>✕</button>
      </div>
      
      <div className="details-tabs">
        <button
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
        <button
          className={activeTab === 'permissions' ? 'active' : ''}
          onClick={() => setActiveTab('permissions')}
        >
          Permissions
        </button>
      </div>
      
      <div className="details-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <p>{plugin.manifest.description}</p>
            
            <h4>Commands</h4>
            <ul>
              {plugin.manifest.commands.map((cmd) => (
                <li key={cmd.id}>
                  <span>{cmd.title}</span>
                  {cmd.shortcut && <kbd>{cmd.shortcut}</kbd>}
                </li>
              ))}
            </ul>
            
            <h4>Categories</h4>
            <div className="categories">
              {plugin.manifest.categories.map((cat) => (
                <Badge key={cat}>{cat}</Badge>
              ))}
            </div>
          </div>
        )}
        
        {activeTab === 'settings' && settings && (
          <div className="settings-tab">
            <JsonSchemaForm
              schema={plugin.manifest.settings}
              value={settings}
              onChange={setSettings}
            />
            <Button onClick={handleSaveSettings}>Save Settings</Button>
          </div>
        )}
        
        {activeTab === 'permissions' && (
          <div className="permissions-tab">
            <ul>
              {plugin.manifest.permissions.map((perm) => (
                <li key={perm}>
                  <PermissionIcon permission={perm} />
                  <span>{formatPermission(perm)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      
      <div className="details-footer">
        <Button variant="destructive" onClick={onUninstall}>
          Uninstall
        </Button>
      </div>
    </div>
  );
}
```

**Deliverables:**
- [ ] Plugin list
- [ ] Plugin details
- [ ] Settings form
- [ ] Install dialog

#### Task 3.1.7-3.1.10: Additional Tasks

- **3.1.7:** Plugin SDK (TypeScript/Rust)
- **3.1.8:** Official Plugins (GitHub, Jira, Slack)
- **3.1.9:** Unit Tests
- **3.1.10:** Documentation

---

## 📊 Definition of Done

- [ ] Plugin discovery ทำงานได้
- [ ] Plugin installation ทำงานได้
- [ ] Plugin sandbox ทำงานได้
- [ ] Plugin API ทำงานได้
- [ ] Hook system ทำงานได้
- [ ] Plugin Manager UI ทำงานได้
- [ ] Official plugins (3+) ทำงานได้
- [ ] Plugin SDK พร้อมใช้งาน
- [ ] Unit tests coverage > 80%

---

## 🚀 Next Sprint

**Sprint 3.2: Marketplace**
- Template store
- Plugin store
- Publish wizard
- Rating & reviews
