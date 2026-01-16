// OpenCode Commands - Tauri commands for OpenCode/OpenWork integration
//
// Phase 2: Desktop App Integration
//
// Provides:
// - OpenCode server management (start/stop)
// - API key management
// - Session management
// - LLM Gateway integration

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

// ============================================
// Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeConfig {
    pub api_key: Option<String>,
    pub server_port: u16,
    pub backend_url: String,
    pub workspace_path: Option<String>,
    pub auto_start: bool,
    pub default_model: String,
}

impl Default for OpenCodeConfig {
    fn default() -> Self {
        Self {
            api_key: None,
            server_port: 3795,
            backend_url: "http://localhost:8000".to_string(),
            workspace_path: None,
            auto_start: false,
            default_model: "anthropic/claude-3.5-sonnet".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeSession {
    pub id: String,
    pub workspace_id: String,
    pub workspace_path: String,
    pub started_at: String,
    pub model: String,
    pub status: SessionStatus,
    pub tokens_used: i64,
    pub cost: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SessionStatus {
    Active,
    Paused,
    Stopped,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    pub running: bool,
    pub port: u16,
    pub pid: Option<u32>,
    pub uptime_seconds: Option<u64>,
    pub active_sessions: i32,
    pub total_requests: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyInfo {
    pub id: String,
    pub name: String,
    pub key_prefix: String,
    pub created_at: String,
    pub expires_at: Option<String>,
    pub last_used_at: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageStats {
    pub total_tokens: i64,
    pub total_cost: f64,
    pub requests_count: i64,
    pub by_model: HashMap<String, ModelUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelUsage {
    pub tokens: i64,
    pub cost: f64,
    pub requests: i64,
}

// ============================================
// State Management
// ============================================

pub struct OpenCodeState {
    config: RwLock<OpenCodeConfig>,
    sessions: RwLock<HashMap<String, OpenCodeSession>>,
    server_process: RwLock<Option<Child>>,
    server_started_at: RwLock<Option<std::time::Instant>>,
}

impl OpenCodeState {
    pub fn new() -> Self {
        Self {
            config: RwLock::new(OpenCodeConfig::default()),
            sessions: RwLock::new(HashMap::new()),
            server_process: RwLock::new(None),
            server_started_at: RwLock::new(None),
        }
    }

    pub async fn load_config(&self, config_path: &str) -> Result<()> {
        if std::path::Path::new(config_path).exists() {
            let content = tokio::fs::read_to_string(config_path).await?;
            let config: OpenCodeConfig = serde_json::from_str(&content)?;
            *self.config.write().await = config;
        }
        Ok(())
    }

    pub async fn save_config(&self, config_path: &str) -> Result<()> {
        let config = self.config.read().await;
        let content = serde_json::to_string_pretty(&*config)?;
        tokio::fs::write(config_path, content).await?;
        Ok(())
    }
}

// ============================================
// Tauri Commands - Server Management
// ============================================

/// Start the OpenCode server
#[tauri::command]
pub async fn opencode_start_server(
    state: State<'_, Arc<OpenCodeState>>,
) -> Result<ServerStatus, String> {
    let config = state.config.read().await;

    // Check if server is already running
    {
        let process = state.server_process.read().await;
        if process.is_some() {
            return Err("Server is already running".to_string());
        }
    }

    // Start the OpenCode server process
    // This would typically start a local proxy server that forwards to the backend
    let port = config.server_port;
    let backend_url = config.backend_url.clone();

    // For now, we'll simulate server start
    // In production, this would spawn an actual server process
    {
        let mut process = state.server_process.write().await;
        let mut started_at = state.server_started_at.write().await;

        // Simulate server process (in real implementation, spawn actual process)
        *started_at = Some(std::time::Instant::now());
    }

    Ok(ServerStatus {
        running: true,
        port,
        pid: None,
        uptime_seconds: Some(0),
        active_sessions: 0,
        total_requests: 0,
    })
}

/// Stop the OpenCode server
#[tauri::command]
pub async fn opencode_stop_server(state: State<'_, Arc<OpenCodeState>>) -> Result<(), String> {
    let mut process = state.server_process.write().await;
    let mut started_at = state.server_started_at.write().await;

    if let Some(mut child) = process.take() {
        child.kill().map_err(|e| e.to_string())?;
    }

    *started_at = None;

    Ok(())
}

/// Get server status
#[tauri::command]
pub async fn opencode_get_server_status(
    state: State<'_, Arc<OpenCodeState>>,
) -> Result<ServerStatus, String> {
    let config = state.config.read().await;
    let process = state.server_process.read().await;
    let started_at = state.server_started_at.read().await;
    let sessions = state.sessions.read().await;

    let uptime = started_at.map(|t| t.elapsed().as_secs());
    let running = started_at.is_some();

    Ok(ServerStatus {
        running,
        port: config.server_port,
        pid: None,
        uptime_seconds: uptime,
        active_sessions: sessions.len() as i32,
        total_requests: 0,
    })
}

// ============================================
// Tauri Commands - Configuration
// ============================================

/// Get OpenCode configuration
#[tauri::command]
pub async fn opencode_get_config(
    state: State<'_, Arc<OpenCodeState>>,
) -> Result<OpenCodeConfig, String> {
    let config = state.config.read().await;
    Ok(config.clone())
}

/// Update OpenCode configuration
#[tauri::command]
pub async fn opencode_set_config(
    state: State<'_, Arc<OpenCodeState>>,
    config: OpenCodeConfig,
) -> Result<(), String> {
    let mut current = state.config.write().await;
    *current = config;
    Ok(())
}

/// Set API key
#[tauri::command]
pub async fn opencode_set_api_key(
    state: State<'_, Arc<OpenCodeState>>,
    api_key: String,
) -> Result<(), String> {
    let mut config = state.config.write().await;
    config.api_key = Some(api_key);
    Ok(())
}

// ============================================
// Tauri Commands - Session Management
// ============================================

/// Create a new OpenCode session for a workspace
#[tauri::command]
pub async fn opencode_create_session(
    state: State<'_, Arc<OpenCodeState>>,
    workspace_id: String,
    workspace_path: String,
) -> Result<OpenCodeSession, String> {
    let config = state.config.read().await;
    let mut sessions = state.sessions.write().await;

    // Check if session already exists for this workspace
    if sessions
        .values()
        .any(|s| s.workspace_id == workspace_id && s.status == SessionStatus::Active)
    {
        return Err("Active session already exists for this workspace".to_string());
    }

    let session = OpenCodeSession {
        id: uuid::Uuid::new_v4().to_string(),
        workspace_id: workspace_id.clone(),
        workspace_path,
        started_at: chrono::Utc::now().to_rfc3339(),
        model: config.default_model.clone(),
        status: SessionStatus::Active,
        tokens_used: 0,
        cost: 0.0,
    };

    sessions.insert(session.id.clone(), session.clone());

    Ok(session)
}

/// Get session by ID
#[tauri::command]
pub async fn opencode_get_session(
    state: State<'_, Arc<OpenCodeState>>,
    session_id: String,
) -> Result<Option<OpenCodeSession>, String> {
    let sessions = state.sessions.read().await;
    Ok(sessions.get(&session_id).cloned())
}

/// List all sessions
#[tauri::command]
pub async fn opencode_list_sessions(
    state: State<'_, Arc<OpenCodeState>>,
    workspace_id: Option<String>,
) -> Result<Vec<OpenCodeSession>, String> {
    let sessions = state.sessions.read().await;

    let result: Vec<OpenCodeSession> = sessions
        .values()
        .filter(|s| {
            workspace_id
                .as_ref()
                .map_or(true, |wid| &s.workspace_id == wid)
        })
        .cloned()
        .collect();

    Ok(result)
}

/// Stop a session
#[tauri::command]
pub async fn opencode_stop_session(
    state: State<'_, Arc<OpenCodeState>>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.write().await;

    if let Some(session) = sessions.get_mut(&session_id) {
        session.status = SessionStatus::Stopped;
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

/// Set model for a session
#[tauri::command]
pub async fn opencode_set_session_model(
    state: State<'_, Arc<OpenCodeState>>,
    session_id: String,
    model: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.write().await;

    if let Some(session) = sessions.get_mut(&session_id) {
        session.model = model;
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

// ============================================
// Tauri Commands - API Key Management
// ============================================

/// Create a new API key via backend
#[tauri::command]
pub async fn opencode_create_api_key(
    state: State<'_, Arc<OpenCodeState>>,
    name: String,
    auth_token: String,
) -> Result<serde_json::Value, String> {
    let config = state.config.read().await;

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/v1/opencode/api-keys", config.backend_url))
        .header("Authorization", format!("Bearer {}", auth_token))
        .json(&serde_json::json!({
            "name": name,
            "expires_in_days": 90
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if response.status().is_success() {
        let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        Ok(data)
    } else {
        let error = response.text().await.unwrap_or_default();
        Err(format!("Failed to create API key: {}", error))
    }
}

/// List API keys via backend
#[tauri::command]
pub async fn opencode_list_api_keys(
    state: State<'_, Arc<OpenCodeState>>,
    auth_token: String,
) -> Result<Vec<ApiKeyInfo>, String> {
    let config = state.config.read().await;

    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/v1/opencode/api-keys", config.backend_url))
        .header("Authorization", format!("Bearer {}", auth_token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if response.status().is_success() {
        let keys: Vec<ApiKeyInfo> = response.json().await.map_err(|e| e.to_string())?;
        Ok(keys)
    } else {
        let error = response.text().await.unwrap_or_default();
        Err(format!("Failed to list API keys: {}", error))
    }
}

/// Revoke an API key
#[tauri::command]
pub async fn opencode_revoke_api_key(
    state: State<'_, Arc<OpenCodeState>>,
    key_id: String,
    auth_token: String,
) -> Result<(), String> {
    let config = state.config.read().await;

    let client = reqwest::Client::new();
    let response = client
        .delete(format!(
            "{}/v1/opencode/api-keys/{}",
            config.backend_url, key_id
        ))
        .header("Authorization", format!("Bearer {}", auth_token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if response.status().is_success() {
        Ok(())
    } else {
        let error = response.text().await.unwrap_or_default();
        Err(format!("Failed to revoke API key: {}", error))
    }
}

// ============================================
// Tauri Commands - Usage & Stats
// ============================================

/// Get usage statistics
#[tauri::command]
pub async fn opencode_get_usage(
    state: State<'_, Arc<OpenCodeState>>,
    auth_token: String,
) -> Result<UsageStats, String> {
    let config = state.config.read().await;

    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/v1/opencode/usage", config.backend_url))
        .header("Authorization", format!("Bearer {}", auth_token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if response.status().is_success() {
        let usage: UsageStats = response.json().await.map_err(|e| e.to_string())?;
        Ok(usage)
    } else {
        // Return empty stats on error
        Ok(UsageStats {
            total_tokens: 0,
            total_cost: 0.0,
            requests_count: 0,
            by_model: HashMap::new(),
        })
    }
}

/// Get session usage
#[tauri::command]
pub async fn opencode_get_session_usage(
    state: State<'_, Arc<OpenCodeState>>,
    session_id: String,
) -> Result<serde_json::Value, String> {
    let sessions = state.sessions.read().await;

    if let Some(session) = sessions.get(&session_id) {
        Ok(serde_json::json!({
            "session_id": session.id,
            "tokens_used": session.tokens_used,
            "cost": session.cost,
            "model": session.model,
            "status": session.status,
        }))
    } else {
        Err("Session not found".to_string())
    }
}

// ============================================
// Tauri Commands - LLM Gateway Integration
// ============================================

/// Send a chat completion request through the gateway
#[tauri::command]
pub async fn opencode_chat_completion(
    state: State<'_, Arc<OpenCodeState>>,
    session_id: String,
    messages: Vec<serde_json::Value>,
    model: Option<String>,
    temperature: Option<f64>,
    max_tokens: Option<i32>,
) -> Result<serde_json::Value, String> {
    let config = state.config.read().await;
    let mut sessions = state.sessions.write().await;

    let api_key = config.api_key.as_ref().ok_or("API key not configured")?;

    let session = sessions.get_mut(&session_id).ok_or("Session not found")?;

    let model = model.unwrap_or_else(|| session.model.clone());

    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "{}/v1/opencode/chat/completions",
            config.backend_url
        ))
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&serde_json::json!({
            "model": model,
            "messages": messages,
            "temperature": temperature.unwrap_or(0.7),
            "max_tokens": max_tokens.unwrap_or(4096),
            "stream": false
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if response.status().is_success() {
        let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

        // Update session usage
        if let Some(usage) = data.get("usage") {
            if let Some(tokens) = usage.get("total_tokens").and_then(|t| t.as_i64()) {
                session.tokens_used += tokens;
            }
        }

        Ok(data)
    } else {
        let status = response.status();
        let error = response.text().await.unwrap_or_default();

        if status.as_u16() == 402 {
            Err("Insufficient credits. Please add credits to continue.".to_string())
        } else {
            Err(format!("Chat completion failed: {}", error))
        }
    }
}

/// Get available models from the gateway
#[tauri::command]
pub async fn opencode_get_models(
    state: State<'_, Arc<OpenCodeState>>,
) -> Result<Vec<serde_json::Value>, String> {
    let config = state.config.read().await;

    let api_key = match &config.api_key {
        Some(key) => key.clone(),
        None => return Ok(vec![]), // Return empty if no API key
    };

    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/v1/opencode/models", config.backend_url))
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if response.status().is_success() {
        let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        if let Some(models) = data.get("data").and_then(|d| d.as_array()) {
            Ok(models.clone())
        } else {
            Ok(vec![])
        }
    } else {
        Ok(vec![])
    }
}

/// Check gateway health
#[tauri::command]
pub async fn opencode_check_health(
    state: State<'_, Arc<OpenCodeState>>,
) -> Result<serde_json::Value, String> {
    let config = state.config.read().await;

    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/v1/opencode/health", config.backend_url))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await;

    match response {
        Ok(resp) if resp.status().is_success() => {
            let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            Ok(data)
        }
        Ok(resp) => Ok(serde_json::json!({
            "status": "error",
            "error": format!("Gateway returned status {}", resp.status())
        })),
        Err(e) => Ok(serde_json::json!({
            "status": "offline",
            "error": e.to_string()
        })),
    }
}

// ============================================
// Helper Functions
// ============================================

/// Generate OpenCode CLI configuration for external tools
#[tauri::command]
pub async fn opencode_generate_cli_config(
    state: State<'_, Arc<OpenCodeState>>,
) -> Result<String, String> {
    let config = state.config.read().await;

    let cli_config = serde_json::json!({
        "provider": "openai",
        "apiKey": config.api_key,
        "baseUrl": format!("{}/v1/opencode", config.backend_url),
        "model": config.default_model,
    });

    serde_json::to_string_pretty(&cli_config).map_err(|e| e.to_string())
}

/// Get connection info for OpenCode CLI
#[tauri::command]
pub async fn opencode_get_connection_info(
    state: State<'_, Arc<OpenCodeState>>,
) -> Result<serde_json::Value, String> {
    let config = state.config.read().await;
    let started_at = state.server_started_at.read().await;

    Ok(serde_json::json!({
        "endpoint": format!("{}/v1/opencode", config.backend_url),
        "port": config.server_port,
        "has_api_key": config.api_key.is_some(),
        "server_running": started_at.is_some(),
        "default_model": config.default_model,
    }))
}
