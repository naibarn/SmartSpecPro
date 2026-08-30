//! Minimal stdio MCP client for the local ComfyUI MCP server.
//! The Worker App owns the transport; the server only selects a registered
//! workflow and sends typed intent. No shell is used and no remote command is
//! accepted.

use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

const MAX_MCP_TOOL_COUNT: usize = 256;
const MAX_MCP_TOOL_SCHEMA_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone)]
pub struct ComfyMcpConfig {
    pub command: String,
    pub managed_command_path: Option<PathBuf>,
    pub args: Vec<String>,
    pub timeout_ms: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ComfyMcpManifest {
    pub protocol_version: Option<String>,
    pub workflow_ids: Vec<String>,
    pub capabilities: Vec<String>,
    pub tool_names: Vec<String>,
    /// Bounded, non-secret JSON schemas used by the Worker workflow form.
    pub tool_schemas: Vec<(String, String)>,
}

struct ComfyMcpSession {
    child: tokio::process::Child,
    stdin: tokio::process::ChildStdin,
    lines: tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
    manifest: ComfyMcpManifest,
    next_request_id: u64,
}

impl Drop for ComfyMcpSession {
    fn drop(&mut self) {
        // Tokio Child does not guarantee termination on drop. The explicit
        // async close path handles normal completion; this fallback prevents
        // negotiation/read failures from leaking a helper process.
        let _ = self.child.start_kill();
    }
}

impl ComfyMcpSession {
    async fn open(config: &ComfyMcpConfig) -> Result<Self, String> {
        let mut last_error = "comfy_mcp_negotiation_failed".to_string();
        for protocol_version in [Some("2025-03-26"), Some("2024-11-05"), None] {
            match Self::spawn(config, protocol_version).await {
                Ok(session) => return Ok(session),
                Err(error) => last_error = error,
            }
        }
        Err(last_error)
    }

    async fn spawn(
        config: &ComfyMcpConfig,
        protocol_version: Option<&str>,
    ) -> Result<Self, String> {
        validate_command(&config.command)?;
        let executable = config
            .managed_command_path
            .as_deref()
            .unwrap_or_else(|| std::path::Path::new(config.command.trim()));
        if config.managed_command_path.as_ref().is_some_and(|path| !path.is_file()) {
            return Err("comfy_mcp_unavailable".into());
        }
        let mut command = Command::new(executable);
        command
            .args(&config.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let mut child = command
            .spawn()
            .map_err(|_| "comfy_mcp_unavailable".to_string())?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "comfy_mcp_stdin_unavailable".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "comfy_mcp_stdout_unavailable".to_string())?;
        let mut session = Self {
            child,
            stdin,
            lines: BufReader::new(stdout).lines(),
            manifest: ComfyMcpManifest::default(),
            next_request_id: 1,
        };

        let first_tools_request_id = if let Some(protocol_version) = protocol_version {
            write_message(
                &mut session.stdin,
                json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": protocol_version,
                        "capabilities": {},
                        "clientInfo": {"name": "smartaihub-worker", "version": "1"}
                    }
                }),
            )
            .await?;
            let initialized = read_response(&mut session.lines, 1, config.timeout_ms).await?;
            if initialized.get("error").is_some() {
                let _ = session.child.kill().await;
                return Err("comfy_mcp_initialize_rejected".into());
            }
            write_message(
                &mut session.stdin,
                json!({"jsonrpc":"2.0","method":"notifications/initialized","params":{}}),
            )
            .await?;
            let mut manifest =
                read_tools_manifest(&mut session.stdin, &mut session.lines, config, 2).await?;
            manifest.protocol_version = initialized
                .get("result")
                .and_then(|result| result.get("protocolVersion"))
                .and_then(Value::as_str)
                .map(str::to_string);
            session.manifest = manifest;
            18
        } else {
            session.manifest =
                read_tools_manifest(&mut session.stdin, &mut session.lines, config, 1).await?;
            17
        };
        session.next_request_id = first_tools_request_id;
        Ok(session)
    }

    async fn call_tool(
        &mut self,
        config: &ComfyMcpConfig,
        tool_name: &str,
        arguments: Value,
    ) -> Result<Value, String> {
        if tool_name.trim().is_empty() {
            return Err("comfy_mcp_tool_missing".into());
        }
        if !self
            .manifest
            .tool_names
            .iter()
            .any(|name| name == tool_name)
        {
            return Err("comfy_mcp_tool_not_advertised".into());
        }
        let request_id = self.next_request_id;
        self.next_request_id = self.next_request_id.saturating_add(1);
        write_message(
            &mut self.stdin,
            json!({"jsonrpc":"2.0","id":request_id,"method":"tools/call","params":{"name":tool_name,"arguments":arguments}}),
        )
        .await?;
        let response = read_response(&mut self.lines, request_id, config.timeout_ms).await?;
        if let Some(error) = response.get("error") {
            return Err(format!("comfy_mcp_tool_error:{}", error));
        }
        Ok(response.get("result").cloned().unwrap_or(response))
    }

    async fn close(mut self) {
        let _ = self.child.kill().await;
    }
}

pub fn validate_command(command: &str) -> Result<(), String> {
    let value = command.trim();
    if value.is_empty() || value.contains(['&', '|', ';', '`', '$', '\\', '/']) {
        return Err("comfy_mcp_command_not_allowlisted".into());
    }
    Ok(())
}

/// Returns true only when the configured, shell-free command is discoverable
/// through PATH. The MCP server is still probed by the real job execution;
/// this check prevents the heartbeat from advertising an obviously missing
/// adapter and prevents the scheduler from assigning work that cannot start.
pub fn command_available(command: &str) -> bool {
    if validate_command(command).is_err() {
        return false;
    }
    let name = command.trim();
    let Some(path) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&path).any(|directory| {
        let candidate = PathBuf::from(directory).join(name);
        candidate.is_file()
            || cfg!(windows)
                && [".exe", ".cmd", ".bat"].iter().any(|suffix| {
                    PathBuf::from(format!("{}{}", candidate.display(), suffix)).is_file()
                })
    })
}

pub fn command_available_with_path(command: &str, managed_command_path: Option<&std::path::Path>) -> bool {
    if validate_command(command).is_err() {
        return false;
    }
    if let Some(path) = managed_command_path {
        return path.is_file();
    }
    command_available(command)
}

pub fn parse_tools_manifest(value: &Value) -> Result<ComfyMcpManifest, String> {
    let result = value
        .get("result")
        .ok_or_else(|| "comfy_mcp_tools_missing".to_string())?;
    let tools = result
        .get("tools")
        .and_then(Value::as_array)
        .ok_or_else(|| "comfy_mcp_tools_missing".to_string())?;
    let mut manifest = ComfyMcpManifest::default();
    collect_string_values(result.get("capabilities"), &mut manifest.capabilities);
    collect_string_values(result.get("capabilityIds"), &mut manifest.capabilities);
    collect_string_values(result.get("workflowIds"), &mut manifest.workflow_ids);
    if tools.len() > MAX_MCP_TOOL_COUNT {
        return Err("comfy_mcp_tool_count_limit".into());
    }
    for tool in tools {
        let name = tool
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| "comfy_mcp_tool_name_missing".to_string())?;
        if name.trim().is_empty()
            || name.len() > 160
            || !name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"._:-".contains(&byte))
        {
            return Err("comfy_mcp_tool_name_invalid".into());
        }
        let input_schema = tool.get("inputSchema").or_else(|| tool.get("input_schema"));
        if !input_schema.is_some_and(Value::is_object) {
            return Err("comfy_mcp_tool_schema_invalid".into());
        }
        let schema = serde_json::to_string(input_schema.expect("validated above"))
            .map_err(|_| "comfy_mcp_tool_schema_invalid".to_string())?;
        if schema.len() > MAX_MCP_TOOL_SCHEMA_BYTES {
            return Err("comfy_mcp_tool_schema_limit".into());
        }
        manifest.tool_names.push(name.to_string());
        manifest.tool_schemas.push((
            name.to_string(),
            schema,
        ));
        collect_string_values(
            tool.get("workflowIds")
                .or_else(|| tool.get("workflow_ids"))
                .or_else(|| tool.get("workflows")),
            &mut manifest.workflow_ids,
        );
        collect_string_values(
            tool.get("capabilities")
                .or_else(|| tool.get("capabilityIds")),
            &mut manifest.capabilities,
        );
    }
    manifest.workflow_ids.sort();
    manifest.workflow_ids.dedup();
    manifest.capabilities.sort();
    manifest.capabilities.dedup();
    manifest.tool_schemas.sort_by(|left, right| left.0.cmp(&right.0));
    manifest.tool_schemas.dedup_by(|left, right| left.0 == right.0);
    Ok(manifest)
}

fn has_workflow_submit_tool(manifest: &ComfyMcpManifest) -> bool {
    ["run_workflow", "run_template", "submit_workflow", "create_execution"]
        .iter()
        .any(|candidate| manifest.tool_names.iter().any(|name| name == candidate))
}

fn manifest_supports_arguments(
    manifest: &ComfyMcpManifest,
    arguments: &Value,
) -> Result<(), String> {
    if !has_workflow_submit_tool(manifest) || manifest.workflow_ids.is_empty() {
        return Err("comfy_mcp_workflow_capability_missing".into());
    }
    let workflow_id = arguments
        .get("workflowId")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "comfy_mcp_workflow_id_missing".to_string())?;
    if !manifest
        .workflow_ids
        .iter()
        .any(|value| value == workflow_id)
    {
        return Err("comfy_mcp_workflow_not_advertised".into());
    }
    let operation = arguments
        .get("operation")
        .and_then(Value::as_str)
        .ok_or_else(|| "comfy_mcp_operation_missing".to_string())?;
    if !matches!(
        operation,
        "text_to_video" | "image_to_video" | "reference_to_video" | "first_last_frame_to_video"
    ) {
        return Err("comfy_mcp_operation_invalid".into());
    }
    let duration_ms = arguments
        .get("durationMs")
        .and_then(Value::as_u64)
        .ok_or_else(|| "comfy_mcp_duration_missing".to_string())?;
    if !(1_000..=90_000).contains(&duration_ms)
        || arguments.get("aspectRatio").and_then(Value::as_str) != Some("9:16")
    {
        return Err("comfy_mcp_shot_arguments_invalid".into());
    }
    let model_route = arguments
        .get("modelRoute")
        .and_then(Value::as_str)
        .ok_or_else(|| "comfy_mcp_model_route_missing".to_string())?;
    if !matches!(
        model_route,
        "generic" | "minimax_h3_t2v" | "minimax_h3_i2v" | "minimax_h3_reference_to_video"
    ) {
        return Err("comfy_mcp_model_route_invalid".into());
    }
    if !manifest.capabilities.is_empty() {
        let capability_matches = |required: &str| {
            manifest
                .capabilities
                .iter()
                .any(|capability| capability == required || capability.contains(required))
        };
        if !capability_matches("shot_video_generation") && !capability_matches(model_route) {
            return Err("comfy_mcp_capability_not_advertised".into());
        }
        let requires_start_frame =
            matches!(operation, "image_to_video" | "first_last_frame_to_video");
        let requires_reference_frames = matches!(
            operation,
            "reference_to_video" | "first_last_frame_to_video"
        );
        if (requires_start_frame && !capability_matches("start_frame"))
            || (requires_reference_frames && !capability_matches("reference_frames"))
        {
            return Err("comfy_mcp_capability_not_advertised".into());
        }
    } else if matches!(
        operation,
        "image_to_video" | "reference_to_video" | "first_last_frame_to_video"
    ) {
        return Err("comfy_mcp_capability_not_advertised".into());
    }
    Ok(())
}

fn collect_string_values(value: Option<&Value>, output: &mut Vec<String>) {
    match value {
        Some(Value::String(value)) if !value.trim().is_empty() && value.len() <= 160 => {
            output.push(value.trim().to_string())
        }
        Some(Value::Array(values)) => values
            .iter()
            .for_each(|value| collect_string_values(Some(value), output)),
        Some(Value::Object(values)) => values
            .values()
            .for_each(|value| collect_string_values(Some(value), output)),
        _ => {}
    }
}

pub async fn discover_manifest(config: &ComfyMcpConfig) -> Result<ComfyMcpManifest, String> {
    let session = ComfyMcpSession::open(config).await?;
    let manifest = session.manifest.clone();
    session.close().await;
    Ok(manifest)
}

pub async fn call_tool(
    config: &ComfyMcpConfig,
    tool_name: &str,
    arguments: Value,
) -> Result<Value, String> {
    let mut session = ComfyMcpSession::open(config).await?;
    let result = session.call_tool(config, tool_name, arguments).await;
    session.close().await;
    result
}

fn find_string_field(value: &Value, names: &[&str]) -> Option<String> {
    if let Some(object) = value.as_object() {
        for name in names {
            if let Some(found) = object
                .get(*name)
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
            {
                return Some(found.to_string());
            }
        }
        for child in object.values() {
            if let Some(found) = find_string_field(child, names) {
                return Some(found);
            }
        }
    }
    if let Some(array) = value.as_array() {
        for child in array {
            if let Some(found) = find_string_field(child, names) {
                return Some(found);
            }
        }
    }
    None
}

fn find_status(value: &Value) -> Option<String> {
    find_string_field(value, &["status", "state", "executionStatus"])
        .map(|value| value.to_ascii_lowercase())
}

pub fn extract_mcp_execution_id(value: &Value) -> Option<String> {
    find_string_field(
        value,
        &[
            "executionId",
            "execution_id",
            "promptId",
            "prompt_id",
            "jobId",
            "job_id",
        ],
    )
}

fn select_tool(manifest: &ComfyMcpManifest, candidates: &[&str]) -> Option<String> {
    candidates
        .iter()
        .find(|candidate| manifest.tool_names.iter().any(|name| name == **candidate))
        .map(|candidate| (*candidate).to_string())
}

/// Execute a workflow through the advertised MCP lifecycle. ComfyUI MCP
/// implementations vary in whether `run_workflow` is synchronous or returns a
/// remote execution id, so this adapter supports both without falling back to
/// direct HTTP. When a lifecycle tool is advertised, Worker restart/cancel
/// logic can reconcile the same execution id instead of submitting twice.
pub async fn run_workflow_with_lifecycle<F>(
    config: &ComfyMcpConfig,
    arguments: Value,
    cancel: &AtomicBool,
    on_execution_id: F,
) -> Result<Value, String>
where
    F: Fn(&str) + Send + Sync,
{
    let mut session = ComfyMcpSession::open(config).await?;
    let result = async {
    manifest_supports_arguments(&session.manifest, &arguments)?;
    let run_tool = select_tool(&session.manifest, &["run_workflow", "submit_workflow", "create_execution"])
        .ok_or_else(|| "comfy_mcp_workflow_submit_tool_missing".to_string())?;
    let result = session.call_tool(config, &run_tool, arguments.clone()).await?;
    let Some(execution_id) = extract_mcp_execution_id(&result) else { return Ok(result); };
    on_execution_id(&execution_id);
    let status_tool = select_tool(&session.manifest, &["wait_workflow", "get_workflow_status", "get_execution", "workflow_status"]);
    let cancel_tool = select_tool(&session.manifest, &["cancel_job", "cancel_workflow", "cancel_execution"]);
    let Some(status_tool) = status_tool else { return Ok(result); };
    for _ in 0..720 {
        if cancel.load(Ordering::Relaxed) {
            if let Some(cancel_tool) = cancel_tool.as_deref() {
                let _ = session.call_tool(config, cancel_tool, json!({ "executionId": execution_id })).await;
            }
            return Err("comfy_mcp_execution_canceled".into());
        }
        let status = session.call_tool(config, &status_tool, json!({ "executionId": execution_id })).await?;
        if let Some(path) = find_string_field(&status, &["artifactPath", "artifact_path", "outputPath", "output_path"]) {
            return Ok(json!({ "executionId": execution_id, "artifactPath": path, "status": "completed" }));
        }
        match find_status(&status).as_deref() {
            Some("completed" | "complete" | "succeeded" | "success" | "done") => return Ok(status),
            Some("failed" | "error" | "canceled" | "cancelled" | "expired") => return Err(format!("comfy_mcp_execution_terminal:{}", find_status(&status).unwrap_or_default())),
            _ => tokio::time::sleep(Duration::from_millis(500)).await,
        }
    }
    Err("comfy_mcp_execution_reconciliation_timeout".into())
    }.await;
    session.close().await;
    result
}

/// Generic workflow lifecycle for image/video jobs whose input schema is
/// discovered from the selected MCP manifest. Unlike the shot helper this
/// function does not invent model-specific arguments; the server-resolved
/// typed payload is forwarded unchanged.
pub async fn run_generic_workflow_with_lifecycle<F>(
    config: &ComfyMcpConfig,
    arguments: Value,
    cancel: &AtomicBool,
    on_execution_id: F,
) -> Result<Value, String>
where
    F: Fn(&str) + Send + Sync,
{
    run_generic_workflow_with_lifecycle_for_tool(config, arguments, None, None, cancel, on_execution_id).await
}

/// Executes a workflow/tool selected by the Worker UI. The optional output
/// directory is used by local `fetch_outputs`; cloud `get_output` responses
/// are returned unchanged because they contain short-lived signed URLs.
pub async fn run_generic_workflow_with_lifecycle_for_tool<F>(
    config: &ComfyMcpConfig,
    arguments: Value,
    requested_tool: Option<&str>,
    output_dir: Option<&std::path::Path>,
    cancel: &AtomicBool,
    on_execution_id: F,
) -> Result<Value, String>
where
    F: Fn(&str) + Send + Sync,
{
    let mut session = ComfyMcpSession::open(config).await?;
    let result = async {
        if let Some(workflow_id) = arguments
            .get("workflowId")
            .or_else(|| arguments.get("workflow_id"))
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
        {
            if !session.manifest.workflow_ids.is_empty()
                && !session.manifest.workflow_ids.iter().any(|value| value == workflow_id)
            {
                return Err("comfy_mcp_workflow_not_advertised".into());
            }
        }
        let run_tool = requested_tool
            .filter(|tool| ["run_workflow", "run_template", "submit_workflow", "create_execution"].contains(tool))
            .filter(|tool| session.manifest.tool_names.iter().any(|name| name == *tool))
            .map(str::to_string)
            .or_else(|| select_tool(&session.manifest, &["run_workflow", "run_template", "submit_workflow", "create_execution"]))
            .ok_or_else(|| "comfy_mcp_workflow_submit_tool_missing".to_string())?;
        if cancel.load(Ordering::Relaxed) {
            return Err("comfy_mcp_execution_canceled".into());
        }
        let submission = session.call_tool(config, &run_tool, arguments).await?;
        let Some(execution_id) = extract_mcp_execution_id(&submission) else { return Ok(submission); };
        on_execution_id(&execution_id);
        let status_tool = select_tool(&session.manifest, &["wait_for_job", "job_status", "get_job_status", "watch_job", "wait_workflow", "get_workflow_status", "get_execution", "workflow_status"]);
        let cancel_tool = select_tool(&session.manifest, &["cancel_job", "cancel_workflow", "cancel_execution"]);
        let Some(status_tool) = status_tool else { return Ok(submission); };
        for _ in 0..720 {
            if cancel.load(Ordering::Relaxed) {
                if let Some(cancel_tool) = cancel_tool.as_deref() {
                    let _ = session.call_tool(config, cancel_tool, lifecycle_arguments(&session.manifest, cancel_tool, &execution_id)).await;
                }
                return Err("comfy_mcp_execution_canceled".into());
            }
            let status = session.call_tool(config, &status_tool, lifecycle_arguments(&session.manifest, &status_tool, &execution_id)).await?;
            if find_string_field(&status, &["artifactPath", "artifact_path", "outputPath", "output_path", "artifactUrl", "artifact_url", "outputUrl", "output_url"]).is_some() {
                let output = fetch_workflow_output(&mut session, config, &execution_id, output_dir).await?;
                return Ok(json!({ "executionId": execution_id, "status": "completed", "submission": submission, "statusResult": status, "output": output }));
            }
            match find_status(&status).as_deref() {
                Some("completed" | "complete" | "succeeded" | "success" | "done") => {
                    let output = fetch_workflow_output(&mut session, config, &execution_id, output_dir).await?;
                    return Ok(json!({ "executionId": execution_id, "status": "completed", "submission": submission, "statusResult": status, "output": output }));
                }
                Some("failed" | "error" | "canceled" | "cancelled" | "expired") => return Err(format!("comfy_mcp_execution_terminal:{}", find_status(&status).unwrap_or_default())),
                _ => tokio::time::sleep(Duration::from_millis(500)).await,
            }
        }
        Err("comfy_mcp_execution_reconciliation_timeout".into())
    }.await;
    session.close().await;
    result
}

fn lifecycle_arguments(manifest: &ComfyMcpManifest, tool_name: &str, execution_id: &str) -> Value {
    let schema = manifest.tool_schemas.iter().find(|(name, _)| name == tool_name).map(|(_, schema)| schema);
    let property_names = schema
        .and_then(|value| serde_json::from_str::<Value>(value).ok())
        .and_then(|value| value.get("properties").cloned())
        .and_then(|value| value.as_object().cloned())
        .map(|properties| properties.into_iter().map(|(name, _)| name).collect::<HashSet<_>>())
        .unwrap_or_default();
    let key = ["executionId", "execution_id", "job_id", "jobId", "prompt_id", "promptId"]
        .iter()
        .find(|candidate| property_names.contains(**candidate))
        .copied()
        .unwrap_or_else(|| if matches!(tool_name, "job_status" | "fetch_outputs") { "prompt_id" } else { "job_id" });
    json!({ key: execution_id })
}

async fn fetch_workflow_output(
    session: &mut ComfyMcpSession,
    config: &ComfyMcpConfig,
    execution_id: &str,
    output_dir: Option<&std::path::Path>,
) -> Result<Value, String> {
    let Some(output_tool) = select_tool(&session.manifest, &["fetch_outputs", "get_output", "get_job_output", "get_execution_output"]) else {
        return Ok(Value::Null);
    };
    let mut arguments = lifecycle_arguments(&session.manifest, &output_tool, execution_id);
    if let Some(output_dir) = output_dir {
        if let Some(object) = arguments.as_object_mut() {
            let schema = session.manifest.tool_schemas.iter().find(|(name, _)| name == &output_tool).map(|(_, schema)| schema);
            let properties = schema
                .and_then(|value| serde_json::from_str::<Value>(value).ok())
                .and_then(|value| value.get("properties").cloned())
                .and_then(|value| value.as_object().cloned())
                .unwrap_or_default();
            for key in ["out_dir", "outDir", "output_dir", "outputDir", "destination"] {
                if properties.contains_key(key) {
                    object.insert(key.to_string(), Value::String(output_dir.to_string_lossy().to_string()));
                    break;
                }
            }
        }
    }
    session.call_tool(config, &output_tool, arguments).await
}

async fn read_tools_manifest(
    stdin: &mut tokio::process::ChildStdin,
    lines: &mut tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
    config: &ComfyMcpConfig,
    first_request_id: u64,
) -> Result<ComfyMcpManifest, String> {
    let mut manifest = ComfyMcpManifest::default();
    let mut cursor: Option<String> = None;
    let mut seen_cursors = HashSet::new();
    for offset in 0..16u64 {
        if let Some(cursor_value) = cursor.as_ref() {
            if !seen_cursors.insert(cursor_value.clone()) {
                return Err("comfy_mcp_tools_list_cursor_loop".into());
            }
        }
        let request_id = first_request_id + offset;
        let params = cursor
            .as_ref()
            .map(|value| json!({ "cursor": value }))
            .unwrap_or_else(|| json!({}));
        write_message(
            stdin,
            json!({"jsonrpc":"2.0","id":request_id,"method":"tools/list","params":params}),
        )
        .await?;
        let page = read_response(lines, request_id, config.timeout_ms).await?;
        let page_manifest = parse_tools_manifest(&page)?;
        merge_manifest(&mut manifest, page_manifest)?;
        cursor = page
            .get("result")
            .and_then(|result| {
                result
                    .get("nextCursor")
                    .or_else(|| result.get("next_cursor"))
            })
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string);
        if cursor.is_none() {
            return Ok(manifest);
        }
    }
    Err("comfy_mcp_tools_pagination_limit".into())
}

fn merge_manifest(target: &mut ComfyMcpManifest, source: ComfyMcpManifest) -> Result<(), String> {
    if target.tool_names.len().saturating_add(source.tool_names.len()) > MAX_MCP_TOOL_COUNT {
        return Err("comfy_mcp_tool_count_limit".into());
    }
    target.workflow_ids.extend(source.workflow_ids);
    target.capabilities.extend(source.capabilities);
    target.tool_names.extend(source.tool_names);
    target.tool_schemas.extend(source.tool_schemas);
    target.workflow_ids.sort();
    target.workflow_ids.dedup();
    target.capabilities.sort();
    target.capabilities.dedup();
    target.tool_names.sort();
    target.tool_names.dedup();
    target.tool_schemas.sort_by(|left, right| left.0.cmp(&right.0));
    target.tool_schemas.dedup_by(|left, right| left.0 == right.0);
    Ok(())
}

async fn write_message(stdin: &mut tokio::process::ChildStdin, value: Value) -> Result<(), String> {
    let mut line = serde_json::to_vec(&value).map_err(|_| "comfy_mcp_encode_failed".to_string())?;
    line.push(b'\n');
    stdin
        .write_all(&line)
        .await
        .map_err(|_| "comfy_mcp_write_failed".to_string())?;
    stdin
        .flush()
        .await
        .map_err(|_| "comfy_mcp_flush_failed".to_string())
}

async fn read_response(
    lines: &mut tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
    id: u64,
    timeout_ms: u64,
) -> Result<Value, String> {
    let deadline = Duration::from_millis(timeout_ms.clamp(1000, 600_000));
    timeout(deadline, async {
        while let Some(line) = lines
            .next_line()
            .await
            .map_err(|_| "comfy_mcp_read_failed".to_string())?
        {
            let value: Value =
                serde_json::from_str(&line).map_err(|_| "comfy_mcp_invalid_message".to_string())?;
            if value.get("id").and_then(Value::as_u64) == Some(id) {
                return Ok(value);
            }
        }
        Err("comfy_mcp_closed_before_response".to_string())
    })
    .await
    .map_err(|_| "comfy_mcp_timeout".to_string())?
}

#[cfg(test)]
mod tests {
    use super::{
        command_available, extract_mcp_execution_id, manifest_supports_arguments,
        lifecycle_arguments, parse_tools_manifest, validate_command, ComfyMcpManifest,
    };
    use serde_json::json;

    #[test]
    fn rejects_shell_and_path_commands() {
        assert!(validate_command("comfyui-mcp").is_ok());
        assert!(validate_command("comfyui-mcp --unsafe && curl").is_err());
        assert!(validate_command("/tmp/comfy-mcp").is_err());
    }

    #[test]
    fn missing_mcp_command_is_not_advertised() {
        assert!(!command_available("smartaihub-command-that-does-not-exist"));
    }

    #[test]
    fn parses_workflows_and_rejects_missing_input_schema() {
        let manifest = parse_tools_manifest(&json!({"result":{"tools":[{"name":"run_workflow","inputSchema":{"type":"object"},"workflowIds":["minimax-h3-shot-video"]}]}})).expect("manifest");
        assert_eq!(manifest.workflow_ids, vec!["minimax-h3-shot-video"]);
        assert!(
            parse_tools_manifest(&json!({"result":{"tools":[{"name":"run_workflow"}]}})).is_err()
        );
    }

    #[test]
    fn bounds_remote_tool_names_and_schemas() {
        assert_eq!(
            parse_tools_manifest(&json!({"result":{"tools":[{"name":"bad tool","inputSchema":{"type":"object"}}]}}))
                .expect_err("unsafe tool names must fail"),
            "comfy_mcp_tool_name_invalid"
        );
        assert_eq!(
            parse_tools_manifest(&json!({"result":{"tools":[{"name":"run_workflow","inputSchema":{"type":"object","description": "x".repeat(65 * 1024)}}]}}))
                .expect_err("oversized schemas must fail"),
            "comfy_mcp_tool_schema_limit"
        );
    }

    #[test]
    fn extracts_remote_execution_ids_without_accepting_paths_as_ids() {
        assert_eq!(
            extract_mcp_execution_id(&json!({"result":{"executionId":"exec-123"}})).as_deref(),
            Some("exec-123")
        );
        assert_eq!(
            extract_mcp_execution_id(&json!({"result":{"artifactPath":"derived/out.mp4"}})),
            None
        );
    }

    #[test]
    fn validates_pinned_workflow_and_typed_shot_arguments() {
        let manifest = parse_tools_manifest(&json!({
            "result": {
                "capabilities": ["shot_video_generation", "start_frame", "reference_frames"],
                "tools": [{
                    "name": "run_workflow",
                    "inputSchema": {"type": "object"},
                    "workflowIds": ["wf-minimax-h3"]
                }]
            }
        }))
        .expect("manifest");
        let arguments = json!({
            "workflowId": "wf-minimax-h3",
            "operation": "first_last_frame_to_video",
            "durationMs": 6000,
            "aspectRatio": "9:16",
            "modelRoute": "minimax_h3_i2v"
        });
        assert!(manifest_supports_arguments(&manifest, &arguments).is_ok());
        assert_eq!(
            manifest_supports_arguments(
                &manifest,
                &json!({
                    "workflowId": "wf-unadvertised",
                    "operation": "text_to_video",
                    "durationMs": 6000,
                    "aspectRatio": "9:16",
                    "modelRoute": "generic"
                })
            )
            .expect_err("unadvertised workflow must fail"),
            "comfy_mcp_workflow_not_advertised"
        );
        assert_eq!(
            manifest_supports_arguments(
                &parse_tools_manifest(&json!({
                    "result": {
                        "capabilities": ["shot_video_generation", "start_frame"],
                        "tools": [{"name": "run_workflow", "inputSchema": {"type": "object"}, "workflowIds": ["wf-minimax-h3"]}]
                    }
                })).expect("manifest"),
                &arguments,
            ).expect_err("reference input requires advertised reference capability"),
            "comfy_mcp_capability_not_advertised"
        );
    }

    #[test]
    fn lifecycle_arguments_follow_the_advertised_schema_names() {
        let manifest = ComfyMcpManifest {
            tool_names: vec!["job_status".into(), "fetch_outputs".into()],
            tool_schemas: vec![
                ("job_status".into(), r#"{"type":"object","properties":{"prompt_id":{"type":"string"}}}"#.into()),
                ("fetch_outputs".into(), r#"{"type":"object","properties":{"prompt_id":{"type":"string"},"out_dir":{"type":"string"}}}"#.into()),
            ],
            ..Default::default()
        };
        assert_eq!(lifecycle_arguments(&manifest, "job_status", "p-1"), json!({"prompt_id":"p-1"}));
        assert_eq!(lifecycle_arguments(&manifest, "fetch_outputs", "p-1"), json!({"prompt_id":"p-1"}));
    }
}
