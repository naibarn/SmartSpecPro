// AI Enhancement Commands - Tauri IPC Commands for AI Features
//
// Provides commands for:
// - Smart suggestions
// - Code completion
// - Quality analysis
// - Auto-documentation

use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::ai_enhancement::{
    AiEnhancementService, Suggestion, CompletionRequest, CompletionResult,
    QualityReport, DocumentationRequest, DocumentationResult, AiSettings,
};

// ============================================
// State Types
// ============================================

pub struct AiEnhancementState {
    pub service: AiEnhancementService,
}

impl AiEnhancementState {
    pub fn new() -> Self {
        Self {
            service: AiEnhancementService::new(),
        }
    }
}

// ============================================
// Suggestion Commands
// ============================================

#[tauri::command]
pub async fn ai_analyze_code(
    state: State<'_, Arc<Mutex<AiEnhancementState>>>,
    project_id: String,
    content: String,
    file_path: String,
) -> Result<Vec<Suggestion>, String> {
    let mut state = state.lock().await;
    Ok(state.service.analyze_code(&project_id, &content, &file_path))
}

#[tauri::command]
pub async fn ai_get_suggestions(
    state: State<'_, Arc<Mutex<AiEnhancementState>>>,
    project_id: String,
) -> Result<Vec<Suggestion>, String> {
    let state = state.lock().await;
    Ok(state.service.get_suggestions(&project_id).into_iter().cloned().collect())
}

#[tauri::command]
pub async fn ai_dismiss_suggestion(
    state: State<'_, Arc<Mutex<AiEnhancementState>>>,
    project_id: String,
    suggestion_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.dismiss_suggestion(&project_id, &suggestion_id)
}

#[tauri::command]
pub async fn ai_apply_suggestion(
    state: State<'_, Arc<Mutex<AiEnhancementState>>>,
    project_id: String,
    suggestion_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.apply_suggestion(&project_id, &suggestion_id)
}

// ============================================
// Completion Commands
// ============================================

#[tauri::command]
pub async fn ai_get_completions(
    state: State<'_, Arc<Mutex<AiEnhancementState>>>,
    request: CompletionRequest,
) -> Result<CompletionResult, String> {
    let state = state.lock().await;
    Ok(state.service.get_completions(&request))
}

// ============================================
// Quality Analysis Commands
// ============================================

#[tauri::command]
pub async fn ai_analyze_quality(
    state: State<'_, Arc<Mutex<AiEnhancementState>>>,
    project_id: String,
    files: Vec<(String, String)>,
) -> Result<QualityReport, String> {
    let mut state = state.lock().await;
    Ok(state.service.analyze_quality(&project_id, &files))
}

#[tauri::command]
pub async fn ai_get_quality_report(
    state: State<'_, Arc<Mutex<AiEnhancementState>>>,
    project_id: String,
) -> Result<QualityReport, String> {
    let state = state.lock().await;
    state.service.get_quality_report(&project_id)
        .cloned()
        .ok_or_else(|| format!("No quality report found for project: {}", project_id))
}

// ============================================
// Documentation Commands
// ============================================

#[tauri::command]
pub async fn ai_generate_documentation(
    state: State<'_, Arc<Mutex<AiEnhancementState>>>,
    request: DocumentationRequest,
) -> Result<DocumentationResult, String> {
    let state = state.lock().await;
    Ok(state.service.generate_documentation(&request))
}

// ============================================
// Settings Commands
// ============================================

#[tauri::command]
pub async fn ai_get_settings(
    state: State<'_, Arc<Mutex<AiEnhancementState>>>,
) -> Result<AiSettings, String> {
    let state = state.lock().await;
    Ok(state.service.get_settings().clone())
}

#[tauri::command]
pub async fn ai_update_settings(
    state: State<'_, Arc<Mutex<AiEnhancementState>>>,
    settings: AiSettings,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.update_settings(settings);
    Ok(())
}
