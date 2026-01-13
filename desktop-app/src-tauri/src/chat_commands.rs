// Chat Commands - Tauri IPC Commands for Chat and Memory
//
// Provides commands for:
// - Chat operations
// - Memory management
// - Model selection
// - Session management

use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::memory_manager::{
    MemoryManager, MemoryStats,
    AddShortTermMemoryRequest, AddWorkingMemoryRequest, AddLongTermMemoryRequest,
    ShortTermMemory, WorkingMemory, LongTermMemory, RetrievalQuery, RetrievedContext,
};
use crate::context_builder::{Skill, ChatContext};
use crate::llm_service::{
    LlmService, LlmServiceConfig, LlmModel, ChatServiceResponse,
    ProviderConfig, LlmProvider,
};

// ============================================
// State Types
// ============================================

pub struct ChatState {
    pub memory_manager: Arc<MemoryManager>,
    pub llm_service: Arc<LlmService>,
}

// ============================================
// Memory Commands
// ============================================

#[tauri::command]
pub async fn add_short_term_memory(
    state: State<'_, Arc<Mutex<ChatState>>>,
    workspace_id: String,
    request: AddShortTermMemoryRequest,
) -> Result<ShortTermMemory, String> {
    let state = state.lock().await;
    state.memory_manager
        .add_short_term_memory(&workspace_id, request)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_session_memory(
    state: State<'_, Arc<Mutex<ChatState>>>,
    workspace_id: String,
    session_id: String,
    limit: Option<i32>,
) -> Result<Vec<ShortTermMemory>, String> {
    let state = state.lock().await;
    state.memory_manager
        .get_session_memory(&workspace_id, &session_id, limit)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_session_memory(
    state: State<'_, Arc<Mutex<ChatState>>>,
    workspace_id: String,
    session_id: String,
) -> Result<usize, String> {
    let state = state.lock().await;
    state.memory_manager
        .clear_session_memory(&workspace_id, &session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_working_memory(
    state: State<'_, Arc<Mutex<ChatState>>>,
    workspace_id: String,
    request: AddWorkingMemoryRequest,
) -> Result<WorkingMemory, String> {
    let state = state.lock().await;
    state.memory_manager
        .add_working_memory(&workspace_id, request)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_pinned_memory(
    state: State<'_, Arc<Mutex<ChatState>>>,
    workspace_id: String,
) -> Result<Vec<WorkingMemory>, String> {
    let state = state.lock().await;
    state.memory_manager
        .get_pinned_memory(&workspace_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pin_memory(
    state: State<'_, Arc<Mutex<ChatState>>>,
    workspace_id: String,
    memory_id: i64,
    pin: bool,
) -> Result<(), String> {
    let state = state.lock().await;
    state.memory_manager
        .pin_memory(&workspace_id, memory_id, pin)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reorder_pinned_memory(
    state: State<'_, Arc<Mutex<ChatState>>>,
    workspace_id: String,
    memory_ids: Vec<i64>,
) -> Result<(), String> {
    let state = state.lock().await;
    state.memory_manager
        .reorder_pinned_memory(&workspace_id, memory_ids)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_long_term_memory(
    state: State<'_, Arc<Mutex<ChatState>>>,
    workspace_id: String,
    request: AddLongTermMemoryRequest,
) -> Result<LongTermMemory, String> {
    let state = state.lock().await;
    state.memory_manager
        .add_long_term_memory(&workspace_id, request)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_long_term_memory(
    state: State<'_, Arc<Mutex<ChatState>>>,
    workspace_id: String,
    memory_id: i64,
    title: Option<String>,
    content: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<(), String> {
    let state = state.lock().await;
    state.memory_manager
        .update_long_term_memory(&workspace_id, memory_id, title, content, tags)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_long_term_memory(
    state: State<'_, Arc<Mutex<ChatState>>>,
    workspace_id: String,
    category: Option<String>,
    limit: Option<i32>,
) -> Result<Vec<LongTermMemory>, String> {
    let state = state.lock().await;
    state.memory_manager
        .get_long_term_memory(&workspace_id, category.as_deref(), limit)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn retrieve_context(
    state: State<'_, Arc<Mutex<ChatState>>>,
    workspace_id: String,
    query: RetrievalQuery,
) -> Result<Vec<RetrievedContext>, String> {
    let state = state.lock().await;
    state.memory_manager
        .retrieve_context(&workspace_id, query)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn consolidate_memories(
    state: State<'_, Arc<Mutex<ChatState>>>,
    workspace_id: String,
    session_id: String,
    min_importance: f64,
) -> Result<Vec<LongTermMemory>, String> {
    let state = state.lock().await;
    state.memory_manager
        .consolidate_memories(&workspace_id, &session_id, min_importance)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cleanup_expired_memories(
    state: State<'_, Arc<Mutex<ChatState>>>,
    workspace_id: String,
) -> Result<usize, String> {
    let state = state.lock().await;
    state.memory_manager
        .cleanup_expired_memories(&workspace_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_memory_stats(
    state: State<'_, Arc<Mutex<ChatState>>>,
    workspace_id: String,
) -> Result<MemoryStats, String> {
    let state = state.lock().await;
    state.memory_manager
        .get_memory_stats(&workspace_id)
        .map_err(|e| e.to_string())
}

// ============================================
// LLM Commands
// ============================================

#[tauri::command]
pub async fn get_available_models(
    state: State<'_, Arc<Mutex<ChatState>>>,
) -> Result<Vec<LlmModel>, String> {
    Ok(LlmModel::get_available_models())
}

#[tauri::command]
pub async fn get_llm_config(
    state: State<'_, Arc<Mutex<ChatState>>>,
) -> Result<LlmServiceConfig, String> {
    let state = state.lock().await;
    Ok(state.llm_service.get_config().await)
}

#[tauri::command]
pub async fn update_llm_config(
    state: State<'_, Arc<Mutex<ChatState>>>,
    config: LlmServiceConfig,
) -> Result<(), String> {
    let state = state.lock().await;
    state.llm_service.update_config(config).await;
    Ok(())
}

#[tauri::command]
pub async fn set_model_for_mode(
    state: State<'_, Arc<Mutex<ChatState>>>,
    mode: String,
    model_id: String,
) -> Result<(), String> {
    let state = state.lock().await;
    state.llm_service.set_model_for_mode(&mode, &model_id).await;
    Ok(())
}

#[tauri::command]
pub async fn get_model_for_mode(
    state: State<'_, Arc<Mutex<ChatState>>>,
    mode: String,
) -> Result<String, String> {
    let state = state.lock().await;
    Ok(state.llm_service.get_model_for_mode(&mode).await)
}

#[tauri::command]
pub async fn estimate_tokens(
    state: State<'_, Arc<Mutex<ChatState>>>,
    text: String,
) -> Result<i32, String> {
    let state = state.lock().await;
    Ok(state.llm_service.estimate_tokens(&text))
}

#[tauri::command]
pub async fn estimate_cost(
    state: State<'_, Arc<Mutex<ChatState>>>,
    model_id: String,
    input_tokens: i32,
    output_tokens: i32,
) -> Result<f64, String> {
    let state = state.lock().await;
    Ok(state.llm_service.estimate_cost(&model_id, input_tokens, output_tokens))
}

// ============================================
// Skills Commands
// ============================================

#[tauri::command]
pub async fn get_available_skills() -> Result<Vec<SkillInfo>, String> {
    let skills = Skill::get_all_skills();
    Ok(skills.into_iter().map(|s| SkillInfo {
        name: s.name,
        command: s.command,
        description: s.description,
        keywords: s.keywords,
    }).collect())
}

#[tauri::command]
pub async fn detect_skill(message: String) -> Result<Option<SkillInfo>, String> {
    let skill = Skill::detect_skill(&message);
    Ok(skill.map(|s| SkillInfo {
        name: s.name,
        command: s.command,
        description: s.description,
        keywords: s.keywords,
    }))
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SkillInfo {
    pub name: String,
    pub command: String,
    pub description: String,
    pub keywords: Vec<String>,
}

// ============================================
// Chat Session Commands
// ============================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub workspace_id: String,
    pub title: String,
    pub skill: Option<String>,
    pub model_id: String,
    pub message_count: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub async fn create_chat_session(
    workspace_id: String,
    title: String,
    skill: Option<String>,
) -> Result<ChatSession, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    
    Ok(ChatSession {
        id,
        workspace_id,
        title,
        skill,
        model_id: "anthropic/claude-3.5-sonnet".to_string(),
        message_count: 0,
        created_at: now.clone(),
        updated_at: now,
    })
}

// ============================================
// Provider Commands
// ============================================

#[tauri::command]
pub async fn get_available_providers() -> Result<Vec<ProviderInfo>, String> {
    Ok(vec![
        ProviderInfo {
            id: "openrouter".to_string(),
            name: "OpenRouter".to_string(),
            description: "Access multiple LLM providers through a single API".to_string(),
            requires_api_key: true,
            supports_fallback: true,
        },
        ProviderInfo {
            id: "openai".to_string(),
            name: "OpenAI".to_string(),
            description: "Direct access to OpenAI models (GPT-4, etc.)".to_string(),
            requires_api_key: true,
            supports_fallback: false,
        },
        ProviderInfo {
            id: "anthropic".to_string(),
            name: "Anthropic".to_string(),
            description: "Direct access to Claude models".to_string(),
            requires_api_key: true,
            supports_fallback: false,
        },
        ProviderInfo {
            id: "deepseek".to_string(),
            name: "Deepseek".to_string(),
            description: "Cost-effective coding-focused models".to_string(),
            requires_api_key: true,
            supports_fallback: false,
        },
        ProviderInfo {
            id: "google".to_string(),
            name: "Google".to_string(),
            description: "Access to Gemini models".to_string(),
            requires_api_key: true,
            supports_fallback: false,
        },
        ProviderInfo {
            id: "local".to_string(),
            name: "Local (Ollama)".to_string(),
            description: "Run models locally with Ollama".to_string(),
            requires_api_key: false,
            supports_fallback: false,
        },
    ])
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub requires_api_key: bool,
    pub supports_fallback: bool,
}

#[tauri::command]
pub async fn test_provider_connection(
    state: State<'_, Arc<Mutex<ChatState>>>,
    provider_id: String,
    api_key: String,
) -> Result<bool, String> {
    // TODO: Implement actual connection test
    // For now, just check if API key is provided
    Ok(!api_key.is_empty())
}
