// CLI Commands - Tauri IPC Commands for OpenCode CLI
//
// Provides commands for:
// - Command parsing and execution
// - File operations
// - Code suggestions
// - History management

use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::cli_service::{
    CliService, CliCommand, CommandResult, CommandStatus, OutputBlock, OutputBlockType,
    CodeSuggestion, SuggestionStatus, FileNode, FileContent, SearchResult,
    get_help_text,
};

// ============================================
// State Types
// ============================================

pub struct CliState {
    pub service: Arc<CliService>,
}

impl CliState {
    pub fn new() -> Self {
        Self {
            service: Arc::new(CliService::new()),
        }
    }
}

// ============================================
// Workspace Commands
// ============================================

#[tauri::command]
pub async fn cli_set_workspace(
    state: State<'_, Arc<Mutex<CliState>>>,
    path: String,
) -> Result<(), String> {
    let state = state.lock().await;
    state.service.set_workspace(&path).await
}

#[tauri::command]
pub async fn cli_get_workspace(
    state: State<'_, Arc<Mutex<CliState>>>,
) -> Result<Option<String>, String> {
    let state = state.lock().await;
    Ok(state.service.get_workspace().await.map(|p| p.to_string_lossy().to_string()))
}

// ============================================
// Command Execution
// ============================================

#[tauri::command]
pub async fn cli_parse_command(
    input: String,
) -> Result<CliCommandInfo, String> {
    let command = CliService::parse_command(&input)?;
    Ok(CliCommandInfo::from(command))
}

#[tauri::command]
pub async fn cli_execute_command(
    state: State<'_, Arc<Mutex<CliState>>>,
    input: String,
) -> Result<CommandResult, String> {
    let state = state.lock().await;
    let start = std::time::Instant::now();
    
    // Add to history
    state.service.add_to_history(&input).await;
    
    // Parse command
    let command = CliService::parse_command(&input)?;
    
    // Execute based on command type
    let (output, suggestions) = match &command {
        CliCommand::Help => {
            let output = vec![OutputBlock {
                block_type: OutputBlockType::Text,
                content: get_help_text(),
                metadata: None,
            }];
            (output, vec![])
        }
        CliCommand::Ask { question } => {
            // TODO: Integrate with LLM service
            let output = vec![OutputBlock {
                block_type: OutputBlockType::Info,
                content: format!("Processing question: {}", question),
                metadata: None,
            }];
            (output, vec![])
        }
        CliCommand::Spec { description } => {
            let output = vec![
                OutputBlock {
                    block_type: OutputBlockType::Info,
                    content: format!("Creating specification for: {}", description),
                    metadata: None,
                },
                OutputBlock {
                    block_type: OutputBlockType::Progress,
                    content: "Analyzing requirements...".to_string(),
                    metadata: None,
                },
            ];
            (output, vec![])
        }
        CliCommand::Plan { task } => {
            let output = vec![
                OutputBlock {
                    block_type: OutputBlockType::Info,
                    content: format!("Planning implementation for: {}", task),
                    metadata: None,
                },
            ];
            (output, vec![])
        }
        CliCommand::Tasks { filter } => {
            let output = vec![OutputBlock {
                block_type: OutputBlockType::TaskList,
                content: format!("Tasks (filter: {:?})", filter),
                metadata: None,
            }];
            (output, vec![])
        }
        CliCommand::Implement { instruction, files } => {
            let mut output = vec![
                OutputBlock {
                    block_type: OutputBlockType::Info,
                    content: format!("Implementing: {}", instruction),
                    metadata: None,
                },
            ];
            
            if !files.is_empty() {
                output.push(OutputBlock {
                    block_type: OutputBlockType::FileList,
                    content: format!("Target files: {}", files.join(", ")),
                    metadata: None,
                });
            }
            
            (output, vec![])
        }
        CliCommand::Debug { error, file } => {
            let output = vec![OutputBlock {
                block_type: OutputBlockType::Info,
                content: format!("Debugging: {:?} in {:?}", error, file),
                metadata: None,
            }];
            (output, vec![])
        }
        CliCommand::Review { files } => {
            let output = vec![OutputBlock {
                block_type: OutputBlockType::Info,
                content: format!("Reviewing files: {}", files.join(", ")),
                metadata: None,
            }];
            (output, vec![])
        }
    };

    Ok(CommandResult {
        command: input,
        status: CommandStatus::Success,
        output,
        suggestions,
        files_read: vec![],
        files_modified: vec![],
        execution_time_ms: start.elapsed().as_millis() as u64,
    })
}

// ============================================
// History Commands
// ============================================

#[tauri::command]
pub async fn cli_get_history(
    state: State<'_, Arc<Mutex<CliState>>>,
) -> Result<Vec<String>, String> {
    let state = state.lock().await;
    Ok(state.service.get_history().await)
}

#[tauri::command]
pub async fn cli_search_history(
    state: State<'_, Arc<Mutex<CliState>>>,
    query: String,
) -> Result<Vec<String>, String> {
    let state = state.lock().await;
    Ok(state.service.search_history(&query).await)
}

// ============================================
// Suggestion Commands
// ============================================

#[tauri::command]
pub async fn cli_add_suggestion(
    state: State<'_, Arc<Mutex<CliState>>>,
    suggestion: CodeSuggestion,
) -> Result<(), String> {
    let state = state.lock().await;
    state.service.add_suggestion(suggestion).await;
    Ok(())
}

#[tauri::command]
pub async fn cli_get_suggestion(
    state: State<'_, Arc<Mutex<CliState>>>,
    id: String,
) -> Result<Option<CodeSuggestion>, String> {
    let state = state.lock().await;
    Ok(state.service.get_suggestion(&id).await)
}

#[tauri::command]
pub async fn cli_accept_suggestion(
    state: State<'_, Arc<Mutex<CliState>>>,
    id: String,
) -> Result<(), String> {
    let state = state.lock().await;
    
    // Get suggestion
    let suggestion = state.service.get_suggestion(&id).await
        .ok_or("Suggestion not found")?;
    
    // Apply changes
    state.service.write_file(&suggestion.file_path, &suggestion.suggested_content).await?;
    
    // Update status
    state.service.update_suggestion_status(&id, SuggestionStatus::Accepted).await?;
    
    Ok(())
}

#[tauri::command]
pub async fn cli_reject_suggestion(
    state: State<'_, Arc<Mutex<CliState>>>,
    id: String,
) -> Result<(), String> {
    let state = state.lock().await;
    state.service.update_suggestion_status(&id, SuggestionStatus::Rejected).await
}

#[tauri::command]
pub async fn cli_modify_suggestion(
    state: State<'_, Arc<Mutex<CliState>>>,
    id: String,
    modified_content: String,
) -> Result<(), String> {
    let state = state.lock().await;
    
    // Get suggestion
    let mut suggestion = state.service.get_suggestion(&id).await
        .ok_or("Suggestion not found")?;
    
    // Update content
    suggestion.suggested_content = modified_content.clone();
    suggestion.status = SuggestionStatus::Modified;
    
    // Apply changes
    state.service.write_file(&suggestion.file_path, &modified_content).await?;
    
    Ok(())
}

#[tauri::command]
pub async fn cli_get_pending_suggestions(
    state: State<'_, Arc<Mutex<CliState>>>,
) -> Result<Vec<CodeSuggestion>, String> {
    let state = state.lock().await;
    Ok(state.service.get_pending_suggestions().await)
}

#[tauri::command]
pub async fn cli_clear_suggestions(
    state: State<'_, Arc<Mutex<CliState>>>,
) -> Result<(), String> {
    let state = state.lock().await;
    state.service.clear_suggestions().await;
    Ok(())
}

// ============================================
// File Commands
// ============================================

#[tauri::command]
pub async fn cli_read_file(
    state: State<'_, Arc<Mutex<CliState>>>,
    path: String,
) -> Result<FileContent, String> {
    let state = state.lock().await;
    state.service.read_file(&path).await
}

#[tauri::command]
pub async fn cli_write_file(
    state: State<'_, Arc<Mutex<CliState>>>,
    path: String,
    content: String,
) -> Result<(), String> {
    let state = state.lock().await;
    state.service.write_file(&path, &content).await
}

#[tauri::command]
pub async fn cli_list_files(
    state: State<'_, Arc<Mutex<CliState>>>,
    dir: Option<String>,
) -> Result<Vec<FileNode>, String> {
    let state = state.lock().await;
    state.service.list_files(dir.as_deref()).await
}

#[tauri::command]
pub async fn cli_search_files(
    state: State<'_, Arc<Mutex<CliState>>>,
    query: String,
    file_pattern: Option<String>,
) -> Result<Vec<SearchResult>, String> {
    let state = state.lock().await;
    state.service.search_files(&query, file_pattern.as_deref()).await
}

// ============================================
// Diff Commands
// ============================================

#[tauri::command]
pub async fn cli_generate_diff(
    original: String,
    modified: String,
) -> Result<Vec<crate::cli_service::DiffHunk>, String> {
    Ok(CliService::generate_diff(&original, &modified))
}

// ============================================
// Helper Types
// ============================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CliCommandInfo {
    pub command_type: String,
    pub args: std::collections::HashMap<String, String>,
}

impl From<CliCommand> for CliCommandInfo {
    fn from(cmd: CliCommand) -> Self {
        let mut args = std::collections::HashMap::new();
        let command_type = match cmd {
            CliCommand::Spec { description } => {
                args.insert("description".to_string(), description);
                "spec"
            }
            CliCommand::Plan { task } => {
                args.insert("task".to_string(), task);
                "plan"
            }
            CliCommand::Tasks { filter } => {
                if let Some(f) = filter {
                    args.insert("filter".to_string(), f);
                }
                "tasks"
            }
            CliCommand::Implement { instruction, files } => {
                args.insert("instruction".to_string(), instruction);
                args.insert("files".to_string(), files.join(","));
                "implement"
            }
            CliCommand::Debug { error, file } => {
                if let Some(e) = error {
                    args.insert("error".to_string(), e);
                }
                if let Some(f) = file {
                    args.insert("file".to_string(), f);
                }
                "debug"
            }
            CliCommand::Review { files } => {
                args.insert("files".to_string(), files.join(","));
                "review"
            }
            CliCommand::Ask { question } => {
                args.insert("question".to_string(), question);
                "ask"
            }
            CliCommand::Help => "help",
        };
        
        Self {
            command_type: command_type.to_string(),
            args,
        }
    }
}
