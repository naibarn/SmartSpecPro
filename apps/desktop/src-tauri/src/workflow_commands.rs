// ========================================
// Workflow Commands for Chat-to-Workflow Bridge
// ========================================
//
// This module provides Tauri commands for executing SmartSpec workflows
// from the Chat UI, enabling seamless integration between natural language
// input and the autopilot system.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;
use std::sync::Arc;

// ========================================
// Types
// ========================================

/// Workflow execution request from frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowRequest {
    /// The workflow command to execute (e.g., "smartspec_generate_spec_from_prompt")
    pub workflow: String,
    /// Arguments for the workflow
    pub args: HashMap<String, String>,
    /// The original user prompt (for spec generation)
    pub prompt: Option<String>,
    /// Platform (kilo, cli, etc.)
    pub platform: String,
}

/// Workflow execution status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WorkflowEvent {
    /// Workflow started
    Started {
        workflow_id: String,
        workflow_name: String,
    },
    /// Log message from workflow
    Log {
        workflow_id: String,
        level: String,
        message: String,
    },
    /// Progress update
    Progress {
        workflow_id: String,
        step: String,
        progress: f64,
        message: String,
    },
    /// Workflow output (intermediate results)
    Output {
        workflow_id: String,
        content: String,
    },
    /// Approval request - workflow needs user confirmation
    ApprovalRequest {
        workflow_id: String,
        artifact_type: String,
        artifact_path: String,
        preview: String,
        next_command: String,
    },
    /// Workflow completed successfully
    Completed {
        workflow_id: String,
        result: serde_json::Value,
    },
    /// Workflow failed
    Failed {
        workflow_id: String,
        error: String,
    },
}

/// State for managing running workflows
pub struct WorkflowState {
    running_workflows: HashMap<String, WorkflowHandle>,
}

struct WorkflowHandle {
    workflow_id: String,
    #[allow(dead_code)]
    workflow_name: String,
    #[allow(dead_code)]
    started_at: chrono::DateTime<chrono::Utc>,
}

impl WorkflowState {
    pub fn new() -> Self {
        Self {
            running_workflows: HashMap::new(),
        }
    }
}

// ========================================
// Intent Detection
// ========================================

/// Detected intent from user message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedIntent {
    /// Whether a workflow intent was detected
    pub detected: bool,
    /// The workflow to execute (if detected)
    pub workflow: Option<String>,
    /// Extracted parameters
    pub params: HashMap<String, String>,
    /// Confidence score (0.0 - 1.0)
    pub confidence: f64,
}

/// Detect workflow intent from user message
#[tauri::command]
pub async fn workflow_detect_intent(message: String) -> Result<DetectedIntent, String> {
    let message_lower = message.to_lowercase();
    
    // Intent patterns for spec generation
    let spec_patterns = vec![
        "สร้าง spec",
        "create spec",
        "generate spec",
        "ช่วยสร้าง spec",
        "ทำ spec",
        "เขียน spec",
    ];
    
    // Intent patterns for plan generation
    let plan_patterns = vec![
        "สร้าง plan",
        "create plan",
        "generate plan",
        "ทำ plan",
    ];
    
    // Intent patterns for implementation
    let implement_patterns = vec![
        "implement",
        "เริ่ม implement",
        "ดำเนินการ",
        "พัฒนา",
    ];
    
    // Check for spec generation intent
    for pattern in &spec_patterns {
        if message_lower.contains(pattern) {
            return Ok(DetectedIntent {
                detected: true,
                workflow: Some("smartspec_generate_spec_from_prompt".to_string()),
                params: {
                    let mut params = HashMap::new();
                    params.insert("prompt".to_string(), message.clone());
                    params
                },
                confidence: 0.9,
            });
        }
    }
    
    // Check for plan generation intent
    for pattern in &plan_patterns {
        if message_lower.contains(pattern) {
            return Ok(DetectedIntent {
                detected: true,
                workflow: Some("smartspec_generate_plan".to_string()),
                params: HashMap::new(),
                confidence: 0.85,
            });
        }
    }
    
    // Check for implementation intent
    for pattern in &implement_patterns {
        if message_lower.contains(pattern) {
            return Ok(DetectedIntent {
                detected: true,
                workflow: Some("smartspec_implement_tasks".to_string()),
                params: HashMap::new(),
                confidence: 0.8,
            });
        }
    }
    
    // No intent detected
    Ok(DetectedIntent {
        detected: false,
        workflow: None,
        params: HashMap::new(),
        confidence: 0.0,
    })
}

// ========================================
// Workflow Execution
// ========================================

/// Execute a SmartSpec workflow
#[tauri::command]
pub async fn workflow_execute(
    app: AppHandle,
    state: State<'_, Arc<Mutex<WorkflowState>>>,
    request: WorkflowRequest,
) -> Result<String, String> {
    let workflow_id = uuid::Uuid::new_v4().to_string();
    let workflow_name = request.workflow.clone();
    
    // Emit started event
    let _ = app.emit("workflow-event", WorkflowEvent::Started {
        workflow_id: workflow_id.clone(),
        workflow_name: workflow_name.clone(),
    });
    
    // Store workflow handle
    {
        let mut state = state.lock().await;
        state.running_workflows.insert(workflow_id.clone(), WorkflowHandle {
            workflow_id: workflow_id.clone(),
            workflow_name: workflow_name.clone(),
            started_at: chrono::Utc::now(),
        });
    }
    
    // Build command
    let command = build_workflow_command(&request)?;
    
    // Clone values for async block
    let workflow_id_clone = workflow_id.clone();
    let app_clone = app.clone();
    let state_clone = state.inner().clone();
    
    // Spawn workflow execution in background
    tokio::spawn(async move {
        match execute_workflow_process(&app_clone, &workflow_id_clone, command).await {
            Ok(result) => {
                let _ = app_clone.emit("workflow-event", WorkflowEvent::Completed {
                    workflow_id: workflow_id_clone.clone(),
                    result,
                });
            }
            Err(e) => {
                let _ = app_clone.emit("workflow-event", WorkflowEvent::Failed {
                    workflow_id: workflow_id_clone.clone(),
                    error: e,
                });
            }
        }
        
        // Remove from running workflows
        let mut state = state_clone.lock().await;
        state.running_workflows.remove(&workflow_id_clone);
    });
    
    Ok(workflow_id)
}

/// Build the command to execute a workflow
fn build_workflow_command(request: &WorkflowRequest) -> Result<Vec<String>, String> {
    let mut cmd = vec![];
    
    // Use ss-autopilot for workflow execution
    cmd.push("python3".to_string());
    cmd.push("-m".to_string());
    cmd.push("ss_autopilot".to_string());
    cmd.push("run".to_string());
    
    // Add workflow name
    cmd.push("--workflow".to_string());
    cmd.push(request.workflow.clone());
    
    // Add platform
    cmd.push("--platform".to_string());
    cmd.push(request.platform.clone());
    
    // Add prompt if present
    if let Some(prompt) = &request.prompt {
        cmd.push("--prompt".to_string());
        cmd.push(prompt.clone());
    }
    
    // Add other args
    for (key, value) in &request.args {
        cmd.push(format!("--{}", key));
        cmd.push(value.clone());
    }
    
    // Add JSON output flag
    cmd.push("--json".to_string());
    
    Ok(cmd)
}

/// Execute the workflow process and stream output
async fn execute_workflow_process(
    app: &AppHandle,
    workflow_id: &str,
    command: Vec<String>,
) -> Result<serde_json::Value, String> {
    if command.is_empty() {
        return Err("Empty command".to_string());
    }
    
    let program = &command[0];
    let args = &command[1..];
    
    // Get workspace path
    let workspace_path = get_workspace_path().unwrap_or_else(|| PathBuf::from("."));
    
    // Spawn process
    let mut child = Command::new(program)
        .args(args)
        .current_dir(&workspace_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;
    
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
    
    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();
    
    let mut last_output = serde_json::Value::Null;
    
    // Read stdout
    let app_stdout = app.clone();
    let workflow_id_stdout = workflow_id.to_string();
    let stdout_handle = tokio::spawn(async move {
        let mut outputs = Vec::new();
        while let Ok(Some(line)) = stdout_reader.next_line().await {
            // Check for special markers
            if line.starts_with("SMARTSPEC_APPROVAL_REQUEST:") {
                if let Some(json_str) = line.strip_prefix("SMARTSPEC_APPROVAL_REQUEST:") {
                    if let Ok(approval) = serde_json::from_str::<serde_json::Value>(json_str) {
                        let _ = app_stdout.emit("workflow-event", WorkflowEvent::ApprovalRequest {
                            workflow_id: workflow_id_stdout.clone(),
                            artifact_type: approval["artifact_type"].as_str().unwrap_or("unknown").to_string(),
                            artifact_path: approval["artifact_path"].as_str().unwrap_or("").to_string(),
                            preview: approval["preview"].as_str().unwrap_or("").to_string(),
                            next_command: approval["next_command"].as_str().unwrap_or("").to_string(),
                        });
                    }
                }
            } else if line.starts_with("SMARTSPEC_PROGRESS:") {
                if let Some(json_str) = line.strip_prefix("SMARTSPEC_PROGRESS:") {
                    if let Ok(progress) = serde_json::from_str::<serde_json::Value>(json_str) {
                        let _ = app_stdout.emit("workflow-event", WorkflowEvent::Progress {
                            workflow_id: workflow_id_stdout.clone(),
                            step: progress["step"].as_str().unwrap_or("").to_string(),
                            progress: progress["progress"].as_f64().unwrap_or(0.0),
                            message: progress["message"].as_str().unwrap_or("").to_string(),
                        });
                    }
                }
            } else if line.starts_with("SMARTSPEC_OUTPUT:") {
                if let Some(json_str) = line.strip_prefix("SMARTSPEC_OUTPUT:") {
                    if let Ok(output) = serde_json::from_str::<serde_json::Value>(json_str) {
                        outputs.push(output);
                    }
                }
            } else {
                // Regular log line
                let _ = app_stdout.emit("workflow-event", WorkflowEvent::Log {
                    workflow_id: workflow_id_stdout.clone(),
                    level: "info".to_string(),
                    message: line,
                });
            }
        }
        outputs
    });
    
    // Read stderr
    let app_stderr = app.clone();
    let workflow_id_stderr = workflow_id.to_string();
    let stderr_handle = tokio::spawn(async move {
        while let Ok(Some(line)) = stderr_reader.next_line().await {
            let _ = app_stderr.emit("workflow-event", WorkflowEvent::Log {
                workflow_id: workflow_id_stderr.clone(),
                level: "error".to_string(),
                message: line,
            });
        }
    });
    
    // Wait for process to complete
    let status = child.wait().await.map_err(|e| format!("Process error: {}", e))?;
    
    // Wait for readers to finish
    let outputs = stdout_handle.await.map_err(|e| format!("Stdout reader error: {}", e))?;
    let _ = stderr_handle.await;
    
    if !outputs.is_empty() {
        last_output = outputs.last().cloned().unwrap_or(serde_json::Value::Null);
    }
    
    if status.success() {
        Ok(last_output)
    } else {
        Err(format!("Workflow exited with code: {:?}", status.code()))
    }
}

/// Get the current workspace path
fn get_workspace_path() -> Option<PathBuf> {
    // Try to get from environment or use current directory
    std::env::var("SMARTSPEC_WORKSPACE")
        .ok()
        .map(PathBuf::from)
        .or_else(|| std::env::current_dir().ok())
}

// ========================================
// Workflow Control
// ========================================

/// Stop a running workflow
#[tauri::command]
pub async fn workflow_stop(
    state: State<'_, Arc<Mutex<WorkflowState>>>,
    workflow_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    if state.running_workflows.remove(&workflow_id).is_some() {
        // In a real implementation, we would kill the child process here
        Ok(())
    } else {
        Err(format!("Workflow {} not found", workflow_id))
    }
}

/// Get list of running workflows
#[tauri::command]
pub async fn workflow_list_running(
    state: State<'_, Arc<Mutex<WorkflowState>>>,
) -> Result<Vec<String>, String> {
    let state = state.lock().await;
    Ok(state.running_workflows.keys().cloned().collect())
}

/// Approve a workflow artifact and continue to next step
#[tauri::command]
pub async fn workflow_approve(
    app: AppHandle,
    state: State<'_, Arc<Mutex<WorkflowState>>>,
    workflow_id: String,
    next_command: String,
) -> Result<String, String> {
    // Parse the next command and execute it
    let request = WorkflowRequest {
        workflow: extract_workflow_from_command(&next_command),
        args: extract_args_from_command(&next_command),
        prompt: None,
        platform: "kilo".to_string(),
    };
    
    workflow_execute(app, state, request).await
}

/// Reject a workflow artifact
#[tauri::command]
pub async fn workflow_reject(
    app: AppHandle,
    workflow_id: String,
    reason: Option<String>,
) -> Result<(), String> {
    let _ = app.emit("workflow-event", WorkflowEvent::Failed {
        workflow_id,
        error: reason.unwrap_or_else(|| "User rejected".to_string()),
    });
    Ok(())
}

// ========================================
// Helper Functions
// ========================================

fn extract_workflow_from_command(command: &str) -> String {
    // Extract workflow name from command like "/smartspec_generate_plan.md specs/..."
    command
        .split_whitespace()
        .next()
        .unwrap_or("")
        .trim_start_matches('/')
        .trim_end_matches(".md")
        .to_string()
}

fn extract_args_from_command(command: &str) -> HashMap<String, String> {
    let mut args = HashMap::new();
    let parts: Vec<&str> = command.split_whitespace().collect();
    
    let mut i = 1; // Skip workflow name
    while i < parts.len() {
        if parts[i].starts_with("--") {
            let key = parts[i].trim_start_matches("--").to_string();
            if i + 1 < parts.len() && !parts[i + 1].starts_with("--") {
                args.insert(key, parts[i + 1].to_string());
                i += 2;
            } else {
                args.insert(key, "true".to_string());
                i += 1;
            }
        } else {
            // Positional argument (likely spec path)
            args.insert("spec_path".to_string(), parts[i].to_string());
            i += 1;
        }
    }
    
    args
}

// ========================================
// Tests
// ========================================

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_extract_workflow_from_command() {
        assert_eq!(
            extract_workflow_from_command("/smartspec_generate_plan.md specs/core/spec-001/spec.md"),
            "smartspec_generate_plan"
        );
    }
    
    #[test]
    fn test_extract_args_from_command() {
        let args = extract_args_from_command("/smartspec_generate_plan.md specs/core/spec-001/spec.md --apply --platform kilo");
        assert_eq!(args.get("spec_path"), Some(&"specs/core/spec-001/spec.md".to_string()));
        assert_eq!(args.get("apply"), Some(&"true".to_string()));
        assert_eq!(args.get("platform"), Some(&"kilo".to_string()));
    }
}
