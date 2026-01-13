// LLM Service - Integration with LLM Providers
//
// Provides:
// - OpenRouter integration (primary)
// - Direct provider fallback
// - Model selection and management
// - Streaming response support
// - Token tracking

use anyhow::{Context, Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

// ============================================
// LLM Provider Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum LlmProvider {
    OpenRouter,
    OpenAI,
    Anthropic,
    Deepseek,
    Google,
    Local,
}

impl LlmProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            LlmProvider::OpenRouter => "openrouter",
            LlmProvider::OpenAI => "openai",
            LlmProvider::Anthropic => "anthropic",
            LlmProvider::Deepseek => "deepseek",
            LlmProvider::Google => "google",
            LlmProvider::Local => "local",
        }
    }
    
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "openrouter" => Some(LlmProvider::OpenRouter),
            "openai" => Some(LlmProvider::OpenAI),
            "anthropic" => Some(LlmProvider::Anthropic),
            "deepseek" => Some(LlmProvider::Deepseek),
            "google" => Some(LlmProvider::Google),
            "local" => Some(LlmProvider::Local),
            _ => None,
        }
    }
    
    pub fn base_url(&self) -> &'static str {
        match self {
            LlmProvider::OpenRouter => "https://openrouter.ai/api/v1",
            LlmProvider::OpenAI => "https://api.openai.com/v1",
            LlmProvider::Anthropic => "https://api.anthropic.com/v1",
            LlmProvider::Deepseek => "https://api.deepseek.com/v1",
            LlmProvider::Google => "https://generativelanguage.googleapis.com/v1beta",
            LlmProvider::Local => "http://localhost:11434/v1",
        }
    }
}

// ============================================
// Model Definitions
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmModel {
    pub id: String,
    pub name: String,
    pub provider: LlmProvider,
    pub context_length: i32,
    pub input_cost_per_1k: f64,
    pub output_cost_per_1k: f64,
    pub supports_vision: bool,
    pub supports_tools: bool,
    pub supports_streaming: bool,
}

impl LlmModel {
    pub fn get_available_models() -> Vec<LlmModel> {
        vec![
            // Claude Models (via OpenRouter or direct)
            LlmModel {
                id: "anthropic/claude-3.5-sonnet".to_string(),
                name: "Claude 3.5 Sonnet".to_string(),
                provider: LlmProvider::OpenRouter,
                context_length: 200000,
                input_cost_per_1k: 0.003,
                output_cost_per_1k: 0.015,
                supports_vision: true,
                supports_tools: true,
                supports_streaming: true,
            },
            LlmModel {
                id: "anthropic/claude-3-opus".to_string(),
                name: "Claude 3 Opus".to_string(),
                provider: LlmProvider::OpenRouter,
                context_length: 200000,
                input_cost_per_1k: 0.015,
                output_cost_per_1k: 0.075,
                supports_vision: true,
                supports_tools: true,
                supports_streaming: true,
            },
            LlmModel {
                id: "anthropic/claude-3-haiku".to_string(),
                name: "Claude 3 Haiku".to_string(),
                provider: LlmProvider::OpenRouter,
                context_length: 200000,
                input_cost_per_1k: 0.00025,
                output_cost_per_1k: 0.00125,
                supports_vision: true,
                supports_tools: true,
                supports_streaming: true,
            },
            
            // GPT Models
            LlmModel {
                id: "openai/gpt-4o".to_string(),
                name: "GPT-4o".to_string(),
                provider: LlmProvider::OpenRouter,
                context_length: 128000,
                input_cost_per_1k: 0.005,
                output_cost_per_1k: 0.015,
                supports_vision: true,
                supports_tools: true,
                supports_streaming: true,
            },
            LlmModel {
                id: "openai/gpt-4o-mini".to_string(),
                name: "GPT-4o Mini".to_string(),
                provider: LlmProvider::OpenRouter,
                context_length: 128000,
                input_cost_per_1k: 0.00015,
                output_cost_per_1k: 0.0006,
                supports_vision: true,
                supports_tools: true,
                supports_streaming: true,
            },
            
            // Deepseek Models
            LlmModel {
                id: "deepseek/deepseek-chat".to_string(),
                name: "Deepseek Chat".to_string(),
                provider: LlmProvider::OpenRouter,
                context_length: 64000,
                input_cost_per_1k: 0.00014,
                output_cost_per_1k: 0.00028,
                supports_vision: false,
                supports_tools: true,
                supports_streaming: true,
            },
            LlmModel {
                id: "deepseek/deepseek-coder".to_string(),
                name: "Deepseek Coder".to_string(),
                provider: LlmProvider::OpenRouter,
                context_length: 64000,
                input_cost_per_1k: 0.00014,
                output_cost_per_1k: 0.00028,
                supports_vision: false,
                supports_tools: true,
                supports_streaming: true,
            },
            
            // Google Models
            LlmModel {
                id: "google/gemini-pro-1.5".to_string(),
                name: "Gemini Pro 1.5".to_string(),
                provider: LlmProvider::OpenRouter,
                context_length: 1000000,
                input_cost_per_1k: 0.00125,
                output_cost_per_1k: 0.005,
                supports_vision: true,
                supports_tools: true,
                supports_streaming: true,
            },
            LlmModel {
                id: "google/gemini-flash-1.5".to_string(),
                name: "Gemini Flash 1.5".to_string(),
                provider: LlmProvider::OpenRouter,
                context_length: 1000000,
                input_cost_per_1k: 0.000075,
                output_cost_per_1k: 0.0003,
                supports_vision: true,
                supports_tools: true,
                supports_streaming: true,
            },
        ]
    }
    
    pub fn get_model_by_id(id: &str) -> Option<LlmModel> {
        Self::get_available_models().into_iter().find(|m| m.id == id)
    }
}

// ============================================
// API Request/Response Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: ToolFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolFunction {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: ToolCallFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallFunction {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub id: String,
    pub model: String,
    pub choices: Vec<ChatChoice>,
    pub usage: Option<TokenUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatChoice {
    pub index: i32,
    pub message: ChatMessage,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub total_tokens: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    pub id: String,
    pub model: String,
    pub choices: Vec<StreamChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChoice {
    pub index: i32,
    pub delta: StreamDelta,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamDelta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
}

// ============================================
// Provider Configuration
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub provider: LlmProvider,
    pub api_key: String,
    pub enabled: bool,
    pub priority: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmServiceConfig {
    pub providers: Vec<ProviderConfig>,
    pub default_model: String,
    pub fallback_enabled: bool,
    pub openrouter_settings: OpenRouterSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterSettings {
    pub allow_fallbacks: bool,
    pub sort_by: Vec<String>, // ["throughput", "latency", "price"]
    pub app_name: String,
    pub app_url: String,
}

impl Default for LlmServiceConfig {
    fn default() -> Self {
        Self {
            providers: vec![
                ProviderConfig {
                    provider: LlmProvider::OpenRouter,
                    api_key: String::new(),
                    enabled: true,
                    priority: 1,
                },
            ],
            default_model: "anthropic/claude-3.5-sonnet".to_string(),
            fallback_enabled: true,
            openrouter_settings: OpenRouterSettings {
                allow_fallbacks: true,
                sort_by: vec!["throughput".to_string(), "latency".to_string(), "price".to_string()],
                app_name: "SmartSpec Pro".to_string(),
                app_url: "https://smartspecpro.dev".to_string(),
            },
        }
    }
}

// ============================================
// LLM Service
// ============================================

pub struct LlmService {
    config: Arc<RwLock<LlmServiceConfig>>,
    http_client: reqwest::Client,
    selected_models: Arc<RwLock<HashMap<String, String>>>, // mode -> model_id
}

impl LlmService {
    pub fn new(config: LlmServiceConfig) -> Self {
        Self {
            config: Arc::new(RwLock::new(config)),
            http_client: reqwest::Client::new(),
            selected_models: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    pub async fn update_config(&self, config: LlmServiceConfig) {
        let mut current = self.config.write().await;
        *current = config;
    }
    
    pub async fn get_config(&self) -> LlmServiceConfig {
        self.config.read().await.clone()
    }
    
    // ========================================
    // Model Selection
    // ========================================
    
    pub async fn set_model_for_mode(&self, mode: &str, model_id: &str) {
        let mut models = self.selected_models.write().await;
        models.insert(mode.to_string(), model_id.to_string());
    }
    
    pub async fn get_model_for_mode(&self, mode: &str) -> String {
        let models = self.selected_models.read().await;
        models.get(mode)
            .cloned()
            .unwrap_or_else(|| {
                let config = futures::executor::block_on(self.config.read());
                config.default_model.clone()
            })
    }
    
    pub fn get_available_models(&self) -> Vec<LlmModel> {
        LlmModel::get_available_models()
    }
    
    // ========================================
    // Chat Completion
    // ========================================
    
    pub async fn chat(
        &self,
        messages: Vec<ChatMessage>,
        model_id: Option<&str>,
        temperature: Option<f64>,
        max_tokens: Option<i32>,
    ) -> Result<ChatResponse> {
        let config = self.config.read().await;
        let model = model_id.unwrap_or(&config.default_model).to_string();
        
        // Try OpenRouter first
        let openrouter = config.providers.iter()
            .find(|p| p.provider == LlmProvider::OpenRouter && p.enabled);
        
        if let Some(provider) = openrouter {
            match self.call_openrouter(&provider.api_key, &model, messages.clone(), temperature, max_tokens, &config.openrouter_settings).await {
                Ok(response) => return Ok(response),
                Err(e) if config.fallback_enabled => {
                    eprintln!("OpenRouter failed, trying fallback: {}", e);
                }
                Err(e) => return Err(e),
            }
        }
        
        // Fallback to direct providers
        if config.fallback_enabled {
            let model_info = LlmModel::get_model_by_id(&model);
            if let Some(info) = model_info {
                let direct_provider = config.providers.iter()
                    .find(|p| p.provider == info.provider && p.enabled);
                
                if let Some(provider) = direct_provider {
                    return self.call_direct_provider(provider, &model, messages, temperature, max_tokens).await;
                }
            }
        }
        
        Err(anyhow!("No available LLM provider"))
    }
    
    async fn call_openrouter(
        &self,
        api_key: &str,
        model: &str,
        messages: Vec<ChatMessage>,
        temperature: Option<f64>,
        max_tokens: Option<i32>,
        settings: &OpenRouterSettings,
    ) -> Result<ChatResponse> {
        let request = ChatRequest {
            model: model.to_string(),
            messages,
            temperature,
            max_tokens,
            stream: Some(false),
            tools: None,
        };
        
        let response = self.http_client
            .post(format!("{}/chat/completions", LlmProvider::OpenRouter.base_url()))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("HTTP-Referer", &settings.app_url)
            .header("X-Title", &settings.app_name)
            .json(&request)
            .send()
            .await
            .context("Failed to send request to OpenRouter")?;
        
        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("OpenRouter API error: {}", error_text));
        }
        
        let chat_response: ChatResponse = response.json().await
            .context("Failed to parse OpenRouter response")?;
        
        Ok(chat_response)
    }
    
    async fn call_direct_provider(
        &self,
        provider: &ProviderConfig,
        model: &str,
        messages: Vec<ChatMessage>,
        temperature: Option<f64>,
        max_tokens: Option<i32>,
    ) -> Result<ChatResponse> {
        let request = ChatRequest {
            model: model.split('/').last().unwrap_or(model).to_string(),
            messages,
            temperature,
            max_tokens,
            stream: Some(false),
            tools: None,
        };
        
        let mut req_builder = self.http_client
            .post(format!("{}/chat/completions", provider.provider.base_url()))
            .header("Authorization", format!("Bearer {}", provider.api_key))
            .json(&request);
        
        // Anthropic uses different header
        if provider.provider == LlmProvider::Anthropic {
            req_builder = req_builder.header("x-api-key", &provider.api_key);
            req_builder = req_builder.header("anthropic-version", "2023-06-01");
        }
        
        let response = req_builder.send().await
            .context("Failed to send request to provider")?;
        
        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Provider API error: {}", error_text));
        }
        
        let chat_response: ChatResponse = response.json().await
            .context("Failed to parse provider response")?;
        
        Ok(chat_response)
    }
    
    // ========================================
    // Streaming Chat
    // ========================================
    
    pub async fn chat_stream(
        &self,
        messages: Vec<ChatMessage>,
        model_id: Option<&str>,
        temperature: Option<f64>,
        max_tokens: Option<i32>,
        on_chunk: impl Fn(StreamChunk) + Send + 'static,
    ) -> Result<TokenUsage> {
        let config = self.config.read().await;
        let model = model_id.unwrap_or(&config.default_model).to_string();
        
        let openrouter = config.providers.iter()
            .find(|p| p.provider == LlmProvider::OpenRouter && p.enabled);
        
        if let Some(provider) = openrouter {
            return self.stream_openrouter(
                &provider.api_key,
                &model,
                messages,
                temperature,
                max_tokens,
                &config.openrouter_settings,
                on_chunk,
            ).await;
        }
        
        Err(anyhow!("No streaming provider available"))
    }
    
    async fn stream_openrouter(
        &self,
        api_key: &str,
        model: &str,
        messages: Vec<ChatMessage>,
        temperature: Option<f64>,
        max_tokens: Option<i32>,
        settings: &OpenRouterSettings,
        on_chunk: impl Fn(StreamChunk) + Send + 'static,
    ) -> Result<TokenUsage> {
        let request = ChatRequest {
            model: model.to_string(),
            messages,
            temperature,
            max_tokens,
            stream: Some(true),
            tools: None,
        };
        
        let response = self.http_client
            .post(format!("{}/chat/completions", LlmProvider::OpenRouter.base_url()))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("HTTP-Referer", &settings.app_url)
            .header("X-Title", &settings.app_name)
            .json(&request)
            .send()
            .await
            .context("Failed to send streaming request")?;
        
        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("OpenRouter streaming error: {}", error_text));
        }
        
        let mut total_tokens = 0;
        let mut stream = response.bytes_stream();
        
        use futures::StreamExt;
        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result.context("Failed to read stream chunk")?;
            let text = String::from_utf8_lossy(&chunk);
            
            for line in text.lines() {
                if line.starts_with("data: ") {
                    let data = &line[6..];
                    if data == "[DONE]" {
                        break;
                    }
                    
                    if let Ok(stream_chunk) = serde_json::from_str::<StreamChunk>(data) {
                        on_chunk(stream_chunk);
                    }
                }
            }
        }
        
        // Return estimated token usage (actual usage comes in final chunk)
        Ok(TokenUsage {
            prompt_tokens: 0,
            completion_tokens: total_tokens,
            total_tokens,
        })
    }
    
    // ========================================
    // Token Estimation
    // ========================================
    
    pub fn estimate_tokens(&self, text: &str) -> i32 {
        // Rough estimation
        let char_count = text.chars().count();
        let has_cjk = text.chars().any(|c| {
            (c >= '\u{4E00}' && c <= '\u{9FFF}') ||  // CJK
            (c >= '\u{0E00}' && c <= '\u{0E7F}')     // Thai
        });
        
        if has_cjk {
            (char_count as f64 / 2.0).ceil() as i32
        } else {
            (char_count as f64 / 4.0).ceil() as i32
        }
    }
    
    pub fn estimate_cost(&self, model_id: &str, input_tokens: i32, output_tokens: i32) -> f64 {
        if let Some(model) = LlmModel::get_model_by_id(model_id) {
            let input_cost = (input_tokens as f64 / 1000.0) * model.input_cost_per_1k;
            let output_cost = (output_tokens as f64 / 1000.0) * model.output_cost_per_1k;
            input_cost + output_cost
        } else {
            0.0
        }
    }
}

// ============================================
// Chat Service (High-level wrapper)
// ============================================

use crate::context_builder::{ContextBuilder, Skill, ApiMessage};
use crate::memory_manager::{MemoryManager, AddShortTermMemoryRequest};

pub struct ChatService {
    llm_service: Arc<LlmService>,
    memory_manager: Arc<MemoryManager>,
    context_builder: Arc<ContextBuilder>,
}

impl ChatService {
    pub fn new(
        llm_service: Arc<LlmService>,
        memory_manager: Arc<MemoryManager>,
        context_builder: Arc<ContextBuilder>,
    ) -> Self {
        Self {
            llm_service,
            memory_manager,
            context_builder,
        }
    }
    
    pub async fn send_message(
        &self,
        workspace_id: &str,
        session_id: &str,
        user_message: &str,
        model_id: Option<&str>,
    ) -> Result<ChatServiceResponse> {
        // 1. Detect skill from message
        let skill = Skill::detect_skill(user_message);
        
        // 2. Build context
        let context = self.context_builder.build_context(
            workspace_id,
            session_id,
            user_message,
            skill.as_ref(),
        )?;
        
        // 3. Format for API
        let api_messages = self.context_builder.format_for_api(&context, user_message);
        
        // 4. Save user message to short-term memory
        self.memory_manager.add_short_term_memory(
            workspace_id,
            AddShortTermMemoryRequest {
                session_id: session_id.to_string(),
                role: "user".to_string(),
                content: user_message.to_string(),
                tool_calls_json: None,
                tool_results_json: None,
                tokens_used: Some(self.llm_service.estimate_tokens(user_message)),
                model_id: model_id.map(|s| s.to_string()),
                ttl_minutes: None,
            },
        )?;
        
        // 5. Call LLM
        let chat_messages: Vec<ChatMessage> = api_messages.into_iter()
            .map(|m| ChatMessage {
                role: m.role,
                content: m.content,
                tool_calls: None,
                tool_call_id: None,
            })
            .collect();
        
        let response = self.llm_service.chat(
            chat_messages,
            model_id,
            Some(0.7),
            Some(4096),
        ).await?;
        
        // 6. Extract response
        let assistant_message = response.choices.first()
            .map(|c| c.message.content.clone())
            .unwrap_or_default();
        
        let tokens_used = response.usage.as_ref()
            .map(|u| u.total_tokens)
            .unwrap_or(0);
        
        // 7. Save assistant message to short-term memory
        self.memory_manager.add_short_term_memory(
            workspace_id,
            AddShortTermMemoryRequest {
                session_id: session_id.to_string(),
                role: "assistant".to_string(),
                content: assistant_message.clone(),
                tool_calls_json: None,
                tool_results_json: None,
                tokens_used: Some(tokens_used),
                model_id: model_id.map(|s| s.to_string()),
                ttl_minutes: None,
            },
        )?;
        
        Ok(ChatServiceResponse {
            message: assistant_message,
            skill_used: skill.map(|s| s.name),
            tokens_used,
            context_tokens: context.total_tokens_estimate,
            retrieved_context_count: context.retrieved_memories.len() as i32,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatServiceResponse {
    pub message: String,
    pub skill_used: Option<String>,
    pub tokens_used: i32,
    pub context_tokens: i32,
    pub retrieved_context_count: i32,
}
